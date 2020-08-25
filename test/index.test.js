const unitUnderTest = require("../src/index");
const cloneDeep = require("lodash.clonedeep");

const expect = require("chai").expect;
const assert = require("chai").assert;
const decache = require("decache");
const nock = require('nock')

const context = {};

const RR = require("gateway/RefugeeRestrooms");
const zipcodes = require("gateway/Zipcodes");
const utilities = require("../src/utilities");

const messages = require("constants/Messages").messages;
const scopes = require("constants/Scopes").scopes;

describe("Finding restrooms near user's geo location", function () {
  const DUMMY_LATITUDE = 47.62078857421875;
  const DUMMY_LONGITUDE = -122.30061853955556;

  const dummyRestRooms = require("../test-data/sample-RR-response.json");

  before(async () => {
    await zipcodes.init();
  });

  afterEach(function () {
    decache("../test-data/nearme_geo_supported");
  });

  it("should be able to fetch restrooms near the user's geo location in the happy case where skill has permissions to access their location.", async () => {
    const event = require("../test-data/nearme_geo_supported");
    event.context.Geolocation.coordinate.latitudeInDegrees = DUMMY_LATITUDE;
    event.context.Geolocation.coordinate.longitudeInDegrees = DUMMY_LONGITUDE;

    configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this restroom close to your location. ${describeRestroom(dummyRestRooms[0])}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.title).to.equal("Restroom details");
    expect(card.type).to.equal("Simple");
    expect(card.content).to.equal(
      `${visuallyDescribeRestroom(dummyRestRooms[0])}
Directions: ${dummyRestRooms[0].directions}
Accessible: ${dummyRestRooms[0].accessible}
Unisex: ${dummyRestRooms[0].unisex}
Has Changing Table: ${dummyRestRooms[0].changing_table}`);
  });

  it("should let the user know if there are no restrooms near the user's geo location", async () => {
    const event = require("../test-data/nearme_geo_supported");

    event.context.Geolocation.coordinate.latitudeInDegrees = DUMMY_LATITUDE;
    event.context.Geolocation.coordinate.longitudeInDegrees = DUMMY_LONGITUDE;

    const emptyRestroomsResult = [];
    configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false, emptyRestroomsResult);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I'm sorry. I couldn't find any restrooms close to your location.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });

  it("should render a message and card requesting for user's geo location permissions if said permissions are not already granted by the user", async () => {
    const event = require("../test-data/nearme_geo_supported");

    // Simulating lack of permissions to fetch user's geo address.
    event.context.System.user.permissions.scopes['alexa::devices:all:geolocation:read'].status = "any value except GRANTED";

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>${messages.NOTIFY_MISSING_GEO_LOCATION_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.type).to.equal("AskForPermissionsConsent");
    expect(card.permissions).to.eql([scopes.GEO_LOCATION_SCOPE]);
  });

  it("should render a message requesting user to enable location services on their device. This is the case where user gave permissions to the skill to access their location but the location services are either completely turned off on their device or the Alexa companion app itself has no access to the device's location.", async () => {
    const event = require("../test-data/nearme_geo_supported");

    // Simulating a device with location sharing disabled.
    event.context.Geolocation.locationServices.access = "any value except ENABLED";

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>Please make sure device location tracking is enabled in your device.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });

  it("should render a message requesting user to try later. This is the case where user gave permissions to the skill to access their location and location sharing is enabled on the device but we are still not able to access the location. This is either a transient issue or some other unexpected issue and so the best course of action is to just tell the user to try again later.", async () => {
    const event_no_geo_location = require("../test-data/nearme_geo_supported");
    delete event_no_geo_location.context.Geolocation;
    decache("../test-data/nearme_geo_supported");

    const event_no_coordinates = require("../test-data/nearme_geo_supported");
    delete event_no_coordinates.context.Geolocation.coordinate;

    const events = [event_no_geo_location, event_no_coordinates];

    for (let index = 0; index < events.length; index++) {
      const event = events[index];
      const responseContainer = await unitUnderTest.handler(event, context);

      const response = responseContainer.response;

      const outputSpeech = response.outputSpeech;
      expect(outputSpeech.ssml).to.equal(
        `<speak>Location Demo is having trouble accessing your location. Please wait a moment, and try again later.</speak>`
      );
      expect(outputSpeech.type).to.equal("SSML");
    }
  });
});

describe("Finding restrooms near device address", function () {
  const US_COUNTRY_CODE = "US";
  const DUMMY_POSTAL_CODE = "77840";

  const aDeviceAddress = {
    countryCode: US_COUNTRY_CODE,
    postalCode: DUMMY_POSTAL_CODE,
  };
  const dummyRestRooms = require("../test-data/sample-RR-response.json");

  before(async () => {
    await zipcodes.init();
  });

  afterEach(function () {
    decache("../test-data/nearme_geo_not_supported");
  });

  it("should be able to fetch the postal address in the happy case where skill has permissions to access the device address.", async () => {
    const event = require("../test-data/nearme_geo_not_supported");
    configureAddressService(200, event.context, aDeviceAddress);

    const coordinates = zipcodes.getCoordinates(DUMMY_POSTAL_CODE);
    configureRRService(200, coordinates.latitude, coordinates.longitude, false, false, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this restroom near you. ${describeRestroom(dummyRestRooms[0])}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.title).to.equal("Restroom details");
    expect(card.type).to.equal("Simple");
    expect(card.content).to.equal(
      `${visuallyDescribeRestroom(dummyRestRooms[0])}
Directions: ${dummyRestRooms[0].directions}
Accessible: ${dummyRestRooms[0].accessible}
Unisex: ${dummyRestRooms[0].unisex}
Has Changing Table: ${dummyRestRooms[0].changing_table}`);
  });

  it("should let the user know if there are no restrooms near the user's geo location", async () => {
    const event = require("../test-data/nearme_geo_not_supported");
    configureAddressService(200, event.context, aDeviceAddress);

    const coordinates = zipcodes.getCoordinates(DUMMY_POSTAL_CODE);
    const emptyRestroomsResult = [];
    configureRRService(200, coordinates.latitude, coordinates.longitude, false, false, emptyRestroomsResult);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I'm sorry. I couldn't find any restrooms near you.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });

  it("should render a message and card requesting for device address permissions if said permissions are not already granted by the user", async () => {
    const event = require("../test-data/nearme_geo_not_supported");

    // Simulating lack of permissions to fetch device address.
    const accessDeniedPayload = {
      code: 'ACCESS_DENIED',
      message: 'access denied to requested resource'
    };
    configureAddressService(403, event.context, accessDeniedPayload);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>${messages.NOTIFY_MISSING_DEVICE_ADDRESS_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.type).to.equal("AskForPermissionsConsent");
    expect(card.permissions).to.eql([scopes.ADDRESS_SCOPE]);
  });

  it("should deliver an error message for any non-service-errors while using device address service", async () => {
    const event = require("../test-data/nearme_geo_not_supported");

    const anyErrorCodeThatIsNot400 = 500;
    configureAddressService(anyErrorCodeThatIsNot400, event.context, {});

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I'm Sorry, I'm having trouble helping you. Please try again later.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });

  it("should render an error message when the zipcode requested by the user is invalid.", async () => {
    const event = require("../test-data/nearme_geo_not_supported");

    const deviceAddress_InvalidPostalCode = {
      countryCode: US_COUNTRY_CODE,
      postalCode: "anInvalidUSAPostalCode",
    };
    configureAddressService(200, event.context, deviceAddress_InvalidPostalCode);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>Sorry. ${deviceAddress_InvalidPostalCode.postalCode} is not a valid postal code in the US. Please try again later.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });

  it("should render an error message when the user's device address is not a US address.", async () => {
    const event = require("../test-data/nearme_geo_not_supported");

    const deviceAddress_NonAmericanAddress = {
      countryCode: "notUS",
      postalCode: "postal code is irrelevant here",
    };
    configureAddressService(200, event.context, deviceAddress_NonAmericanAddress);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>Sorry. I currently only support locations within the United States.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });

  it("should render an error message when the user's device address does not include a postal code.", async () => {
    const event = require("../test-data/nearme_geo_not_supported");

    const deviceAddress_NoPostalCode = {
      countryCode: US_COUNTRY_CODE,
      postalCode: null,
    };
    configureAddressService(200, event.context, deviceAddress_NoPostalCode);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>Sorry. I was unable to determine your device location with sufficient granualarity. Please try again later.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });
});

describe("Finding restrooms at a user specified location", function () {
  const dummyRestRooms = require("../test-data/sample-RR-response.json");

  before(async () => {
    await zipcodes.init();
  });

  afterEach(function () {
    decache("../test-data/atlocation");
  });

  it("should be able to find restrooms at the location specified by the user.", async () => {
    const event = require("../test-data/atlocation");

    const zipcode = event.session.attributes.zipcode;
    const coordinates = zipcodes.getCoordinates(zipcode);
    configureRRService(200, coordinates.latitude, coordinates.longitude, false, false, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this restroom at <say-as interpret-as="digits">${zipcode}</say-as>. ${describeRestroom(dummyRestRooms[0])}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.title).to.equal("Restroom details");
    expect(card.type).to.equal("Simple");
    expect(card.content).to.equal(
      `${visuallyDescribeRestroom(dummyRestRooms[0])}
Directions: ${dummyRestRooms[0].directions}
Accessible: ${dummyRestRooms[0].accessible}
Unisex: ${dummyRestRooms[0].unisex}
Has Changing Table: ${dummyRestRooms[0].changing_table}`);
  });

  it("should let the user know if there are no restrooms in the location they are searching for", async () => {
    const event = require("../test-data/atlocation");

    const zipcode = event.session.attributes.zipcode;
    const coordinates = zipcodes.getCoordinates(zipcode);
    const emptyRestroomsResult = [];
    configureRRService(200, coordinates.latitude, coordinates.longitude, false, false, emptyRestroomsResult);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I'm sorry. I couldn't find any restrooms at <say-as interpret-as="digits">${zipcode}</say-as> matching your criteria.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });
});

describe("Honor search filters when searching for restrooms near the user's location", function () {
  const dummyRestRooms = require("../test-data/sample-RR-response.json");

  before(async () => {
    await zipcodes.init();
  });

  afterEach(function () {
    decache("../test-data/nearme_ada_unisex_filters");
    decache("../test-data/nearme_ada_filters");
    decache("../test-data/nearme_unisex_filters");
    decache("../test-data/nearme_ada_unisex_changing_table_filters");
  });

  it("should be able to fetch restrooms when user filters for accessible & unisex restrooms", async () => {
    const event = require("../test-data/nearme_ada_unisex_filters");
    const latitude = event.context.Geolocation.coordinate.latitudeInDegrees;
    const longitude = event.context.Geolocation.coordinate.longitudeInDegrees;

    configureRRService(200, latitude, longitude, true, true, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this restroom close to your location. ${describeRestroom(dummyRestRooms[0])}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });

  it("should be able to fetch restrooms when user filters for accessible restrooms", async () => {
    const event = require("../test-data/nearme_ada_filters");
    const latitude = event.context.Geolocation.coordinate.latitudeInDegrees;
    const longitude = event.context.Geolocation.coordinate.longitudeInDegrees;

    configureRRService(200, latitude, longitude, true, false, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this restroom close to your location. ${describeRestroom(dummyRestRooms[0])}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });

  it("should be able to fetch restrooms when user filters for unisex restrooms", async () => {
    const event = require("../test-data/nearme_unisex_filters");
    const latitude = event.context.Geolocation.coordinate.latitudeInDegrees;
    const longitude = event.context.Geolocation.coordinate.longitudeInDegrees;

    configureRRService(200, latitude, longitude, false, true, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this restroom close to your location. ${describeRestroom(dummyRestRooms[0])}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });

  it("should be able to fetch restrooms when user filters for accessible & unisex & changing_table restrooms. Refugee Restrooms does not support filtering by changing_table restrooms and so we filter it ourselves. Hence this additional test.", async () => {
    const event = require("../test-data/nearme_ada_unisex_changing_table_filters");
    const latitude = event.context.Geolocation.coordinate.latitudeInDegrees;
    const longitude = event.context.Geolocation.coordinate.longitudeInDegrees;

    let firstRestroomWithChangingTable;
    for (var index = 0; index < dummyRestRooms.length; index++) {
      let restroom = dummyRestRooms[index];
      if (restroom.changing_table) { firstRestroomWithChangingTable = restroom; break; }
    }
    configureRRService(200, latitude, longitude, true, true, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this restroom close to your location. ${describeRestroom(firstRestroomWithChangingTable)}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    // once we start navigating through all restrooms, assertions can get better here. Count the number of changing table restrooms in dummyRestrooms and
    // assert that we are only presenting that many restrooms and that all restrooms we are presenting to the user have changing tables.
  });
});

function configureAddressService(responseCode, context, payload) {
  if (!nock.isActive()) {
    nock.activate();
  }

  nock(context.System.apiEndpoint)
    .get(`/v1/devices/${context.System.device.deviceId}/settings/address/countryAndPostalCode`)
    .query(true)
    .reply(responseCode, JSON.stringify(payload, null, 2));
}

function configureRRService(responseCode, latitude, longitude, isFilterByADA, isFilterByUnisex, payload) {
  if (!nock.isActive()) {
    nock.activate();
  }

  nock(RR.BASE_URL)
    .get(`/api/v1/restrooms/by_location?page=1&per_page=10&offset=0&ada=${isFilterByADA}&unisex=${isFilterByUnisex}&lat=${latitude}&lng=${longitude}`)
    .reply(responseCode, JSON.stringify(payload, null, 2));
}

/**
 * SSML response describing the restroom to be delivered to the customers.
 */
function describeRestroom(restroom) {
  return `<s>${restroom.name}</s> <say-as interpret-as="address"> ${restroom.street} </say-as>, ${restroom.city}`;
}

/**
 * Visual response describing the restroom to be delivered to the customers.
 */
function visuallyDescribeRestroom(restroom) {
  return `${restroom.name}, ${restroom.street}, ${restroom.city}, ${restroom.state}`;
}
