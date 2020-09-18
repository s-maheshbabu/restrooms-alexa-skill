const unitUnderTest = require("../src/index");

const expect = require("chai").expect;
const assert = require("chai").assert;
const decache = require("decache");
const nock = require('nock')

const cloneDeep = require("lodash.clonedeep");

const Mailer = require("gateway/Mailer.js");
const nodemailerMock = require('nodemailer-mock');
const transporter = nodemailerMock.createTransport({
  host: '127.0.0.1',
  port: -100,
});
const mockery = require('mockery');

const context = {};

const RR = require("gateway/RefugeeRestrooms");
const zipcodes = require("gateway/Zipcodes");

const messages = require("constants/Messages").messages;
const scopes = require("constants/Scopes").scopes;

const APL_CONSTANTS = require("constants/APL");
const APL_DOCUMENT_TYPE = APL_CONSTANTS.APL_DOCUMENT_TYPE;
const APL_DOCUMENT_VERSION = APL_CONSTANTS.APL_DOCUMENT_VERSION;
const restroomDetailsDocument = require("apl/document/RestroomDetailsDocument.json");
const restroomDetailsDatasource = require("apl/data/RestroomDetailsDatasource");

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

    const restroomDelivered = dummyRestRooms[0];
    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this restroom near you. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.type).to.equal("AskForPermissionsConsent");
    expect(card.permissions).to.eql([scopes.EMAIL_SCOPE]);

    verifyAPLDirectiveStructure(response.directives);
    const directive = response.directives[0];
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom near you.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `Gender Neutral: &#9989;<br>Accessible: &#9989;<br>Changing Table: &#10060;`
      )
    );
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
      `<speak>I'm sorry. I couldn't find any restrooms near you.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });

  it("should render a message and card requesting for user's geo location permissions if said permissions are not already granted by the user", async () => {
    const event = require("../test-data/nearme_geo_supported");

    // Simulating lack of permissions to fetch user's geo address.
    event.context.System.user.permissions.scopes['alexa::devices:all:geolocation:read'].status = "any value except GRANTED";

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

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
      `<speak>Please make sure device location tracking is enabled in your device, and try again later.</speak>`
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
        `<speak>Refugee Restrooms is having trouble accessing your location. Please make sure device location tracking is enabled in your device, and try again later.</speak>`
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

    const restroomDelivered = dummyRestRooms[0];
    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this restroom near you. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.type).to.equal("AskForPermissionsConsent");
    expect(card.permissions).to.eql([scopes.EMAIL_SCOPE]);

    verifyAPLDirectiveStructure(response.directives);
    const directive = response.directives[0];
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom near you.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `Gender Neutral: &#9989;<br>Accessible: &#9989;<br>Changing Table: &#10060;`
      )
    );
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
    assert(response.shouldEndSession);

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
    assert(response.shouldEndSession);

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

    const restroomDelivered = dummyRestRooms[0];
    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this restroom at <say-as interpret-as="digits">${zipcode}</say-as>. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.type).to.equal("AskForPermissionsConsent");
    expect(card.permissions).to.eql([scopes.EMAIL_SCOPE]);

    verifyAPLDirectiveStructure(response.directives);
    const directive = response.directives[0];
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom at ${zipcode}.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `Gender Neutral: &#9989;<br>Accessible: &#9989;<br>Changing Table: &#10060;`
      )
    );
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

  it("should render an error message if the zipcode provided by the user is invalid.", async () => {
    const event = require("../test-data/atlocation");

    const anInvalidZipCode = "an-invalid-zipcode";
    event.session.attributes.zipcode = anInvalidZipCode;

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>Sorry. <say-as interpret-as="digits">${anInvalidZipCode}</say-as> is not a valid zipcode in the US. Please try again with a valid five digit U.S. zipcode.</speak>`
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
      `<speak>I found this restroom near you. ${describeRestroom(dummyRestRooms[0])}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
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
      `<speak>I found this restroom near you. ${describeRestroom(dummyRestRooms[0])}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
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
      `<speak>I found this restroom near you. ${describeRestroom(dummyRestRooms[0])}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
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
      `<speak>I found this restroom near you. ${describeRestroom(firstRestroomWithChangingTable)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    // once we start navigating through all restrooms, assertions can get better here. Count the number of changing table restrooms in dummyRestrooms and
    // assert that we are only presenting that many restrooms and that all restrooms we are presenting to the user have changing tables.
  });
});

describe("APL directives support", function () {
  const DUMMY_LATITUDE = 47.62078857421875;
  const DUMMY_LONGITUDE = -122.30061853955556;

  const dummyRestRooms = require("../test-data/sample-RR-response.json");

  before(async () => {
    await zipcodes.init();
  });

  afterEach(function () {
    decache("../test-data/nearme_geo_supported_no_apl");
    decache("../test-data/nearme_geo_supported");
  });

  it("should not include the APL directives when the device does not support APL.", async () => {
    const event = require("../test-data/nearme_geo_supported_no_apl");
    event.context.Geolocation.coordinate.latitudeInDegrees = DUMMY_LATITUDE;
    event.context.Geolocation.coordinate.longitudeInDegrees = DUMMY_LONGITUDE;

    configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const restroomDelivered = dummyRestRooms[0];
    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this restroom near you. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    expect(response.directives).to.be.undefined;
  });

  it("the features of the restroom should be accurately represented in the APL visual.", async () => {
    const event = require("../test-data/nearme_geo_supported");
    event.context.Geolocation.coordinate.latitudeInDegrees = DUMMY_LATITUDE;
    event.context.Geolocation.coordinate.longitudeInDegrees = DUMMY_LONGITUDE;

    const NUMBER_OF_RESTROOM_FEATURES = 3;
    const restroomFeaturePossibilities = [];
    for (let i = 0; i < (1 << NUMBER_OF_RESTROOM_FEATURES); i++) {
      const featureSet = [];
      for (let j = NUMBER_OF_RESTROOM_FEATURES - 1; j >= 0; j--) {
        featureSet.push(Boolean(i & (1 << j)));
      }
      restroomFeaturePossibilities.push(featureSet);
    }

    // Make a copy since we will be modifying the restroom to arrange for test.
    const clonedDummyRestRooms = cloneDeep(dummyRestRooms);
    const restroomDelivered = clonedDummyRestRooms[0];
    for (let i = 0; i < restroomFeaturePossibilities.length; i++) {
      const featureSet = restroomFeaturePossibilities[i];
      const isUnisex = featureSet[0];
      const isAccessible = featureSet[1];
      const isChangingTable = featureSet[2];

      restroomDelivered.unisex = isUnisex;
      restroomDelivered.accessible = isAccessible;
      restroomDelivered.changing_table = isChangingTable;

      configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false, clonedDummyRestRooms);
      configureUpsService(403, event.context, {});

      const responseContainer = await unitUnderTest.handler(event, context);

      const response = responseContainer.response;
      assert(response.shouldEndSession);

      const outputSpeech = response.outputSpeech;
      expect(outputSpeech.ssml).to.equal(
        `<speak>I found this restroom near you. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
      );
      expect(outputSpeech.type).to.equal("SSML");

      verifyAPLDirectiveStructure(response.directives);
      const directive = response.directives[0];
      expect(directive.document).to.eql(restroomDetailsDocument);
      const actualDatasource = directive.datasources;
      expect(actualDatasource).to.eql(
        restroomDetailsDatasource(
          `Here is a restroom near you.`,
          `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
          `Gender Neutral: ${isUnisex ? '&#9989;' : '&#10060;'}<br>Accessible: ${isAccessible ? '&#9989;' : '&#10060;'}<br>Changing Table: ${isChangingTable ? '&#9989;' : '&#10060;'}`
        )
      );
    }
  });
});

describe("Sending emails", function () {
  const FROM_EMAIL_ADDRESS = "s.maheshbabu@hotmail.com";
  const DUMMY_EMAIL_ADDRESS = "success@simulator.amazonses.com";

  const DUMMY_LATITUDE = 47.62078857421875;
  const DUMMY_LONGITUDE = -122.30061853955556;

  const US_COUNTRY_CODE = "US";
  const DUMMY_POSTAL_CODE = "77840";

  const aDeviceAddress = {
    countryCode: US_COUNTRY_CODE,
    postalCode: DUMMY_POSTAL_CODE,
  };

  const dummyRestRooms = require("../test-data/sample-RR-response.json");

  before(async () => {
    await zipcodes.init();

    mockery.enable({ warnOnUnregistered: false });
    mockery.registerMock('nodemailer', nodemailerMock);
    await Mailer.init(transporter);
  });

  afterEach(function () {
    decache("../test-data/nearme_geo_supported");
    decache("../test-data/nearme_geo_not_supported");
    decache("../test-data/atlocation");
    nodemailerMock.mock.reset();
  });

  after(async () => {
    mockery.deregisterAll();
    mockery.disable();
  });

  it("should send an email to the user with search results when users searched for restrooms near their geo location and have granted permission to use their email.", async () => {
    const event = require("../test-data/nearme_geo_supported");
    event.context.Geolocation.coordinate.latitudeInDegrees = DUMMY_LATITUDE;
    event.context.Geolocation.coordinate.longitudeInDegrees = DUMMY_LONGITUDE;

    configureUpsService(200, event.context, DUMMY_EMAIL_ADDRESS);
    configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);
    const response = responseContainer.response;

    assert(response.shouldEndSession);
    const restroomDelivered = dummyRestRooms[0];
    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this restroom near you. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.title).to.equal("Here are some restrooms near you.");
    expect(card.type).to.equal("Simple");
    expect(card.content).to.equal(buildSimpleCardContent(dummyRestRooms));

    verifyAPLDirectiveStructure(response.directives);
    const directive = response.directives[0];
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom near you.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `Gender Neutral: &#9989;<br>Accessible: &#9989;<br>Changing Table: &#10060;`
      )
    );

    const sentMail = nodemailerMock.mock.getSentMail();
    expect(sentMail.length).to.equal(1);
    expect(sentMail[0].from).to.equal(FROM_EMAIL_ADDRESS);
    expect(sentMail[0].to).to.equal(DUMMY_EMAIL_ADDRESS);

    expect(sentMail[0].subject).to.equal(`Refugee Restrooms - Alexa Skill`);

    const htmlBody = sentMail[0].html;
    expect(htmlBody.includes(`near you`)).to.be.true;
    dummyRestRooms.slice(0, 10).forEach(restroom => {
      expect(htmlBody.includes(restroom.name)).to.be.true;
    });
  });

  it("should send an email to the user with search results when users searched for restrooms near their device address and have granted permission to use their email.", async () => {
    const event = require("../test-data/nearme_geo_not_supported");
    configureAddressService(200, event.context, aDeviceAddress);

    const coordinates = zipcodes.getCoordinates(DUMMY_POSTAL_CODE);
    configureRRService(200, coordinates.latitude, coordinates.longitude, false, false, dummyRestRooms);

    configureUpsService(200, event.context, DUMMY_EMAIL_ADDRESS);

    const responseContainer = await unitUnderTest.handler(event, context);
    const response = responseContainer.response;

    assert(response.shouldEndSession);
    const restroomDelivered = dummyRestRooms[0];
    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this restroom near you. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.title).to.equal("Here are some restrooms near you.");
    expect(card.type).to.equal("Simple");
    expect(card.content).to.equal(buildSimpleCardContent(dummyRestRooms));

    verifyAPLDirectiveStructure(response.directives);
    const directive = response.directives[0];
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom near you.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `Gender Neutral: &#9989;<br>Accessible: &#9989;<br>Changing Table: &#10060;`
      )
    );

    const sentMail = nodemailerMock.mock.getSentMail();
    expect(sentMail.length).to.equal(1);
    expect(sentMail[0].from).to.equal(FROM_EMAIL_ADDRESS);
    expect(sentMail[0].to).to.equal(DUMMY_EMAIL_ADDRESS);

    expect(sentMail[0].subject).to.equal(`Refugee Restrooms - Alexa Skill`);

    const htmlBody = sentMail[0].html;
    expect(htmlBody.includes(`near you`)).to.be.true;
    dummyRestRooms.slice(0, 10).forEach(restroom => {
      expect(htmlBody.includes(restroom.name)).to.be.true;
    });
  });

  it("should send an email to the user with search results when users searched for restrooms by zipcode and have granted permission to use their email.", async () => {
    const event = require("../test-data/atlocation");
    const zipcode = event.session.attributes.zipcode;
    const coordinates = zipcodes.getCoordinates(zipcode);
    configureRRService(200, coordinates.latitude, coordinates.longitude, false, false, dummyRestRooms);

    configureUpsService(200, event.context, DUMMY_EMAIL_ADDRESS);

    const responseContainer = await unitUnderTest.handler(event, context);
    const response = responseContainer.response;

    assert(response.shouldEndSession);
    const restroomDelivered = dummyRestRooms[0];
    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this restroom at <say-as interpret-as="digits">${zipcode}</say-as>. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.title).to.equal(`Here are some restrooms at ${zipcode}`);
    expect(card.type).to.equal("Simple");
    expect(card.content).to.equal(buildSimpleCardContent(dummyRestRooms));

    verifyAPLDirectiveStructure(response.directives);
    const directive = response.directives[0];
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom at ${zipcode}.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `Gender Neutral: &#9989;<br>Accessible: &#9989;<br>Changing Table: &#10060;`
      )
    );

    const sentMail = nodemailerMock.mock.getSentMail();
    expect(sentMail.length).to.equal(1);
    expect(sentMail[0].from).to.equal(FROM_EMAIL_ADDRESS);
    expect(sentMail[0].to).to.equal(DUMMY_EMAIL_ADDRESS);

    expect(sentMail[0].subject).to.equal(`Refugee Restrooms - Alexa Skill`);

    const htmlBody = sentMail[0].html;
    expect(htmlBody.includes(`at ${zipcode}`)).to.be.true;
    dummyRestRooms.slice(0, 10).forEach(restroom => {
      expect(htmlBody.includes(restroom.name)).to.be.true;
    });
  });

  it("should not send an email with search results when users searched for restrooms near their geo location but hasn't granted permissions to use their email address or we failed to fetch email address due to other service errors.", async () => {
    const event = require("../test-data/nearme_geo_supported");
    event.context.Geolocation.coordinate.latitudeInDegrees = DUMMY_LATITUDE;
    event.context.Geolocation.coordinate.longitudeInDegrees = DUMMY_LONGITUDE;


    // Simulating lack of permissions to fetch user profile information.
    const errorPayload = {
      code: 'ERROR_CODE',
      message: 'some message to indicate the request was not successful',
    };
    const error_codes = [204, 401, 403, 429, 500]
    for (var index = 0; index < error_codes.length; index++) {
      configureUpsService(error_codes[index], event.context, errorPayload);
      configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false, dummyRestRooms);

      const responseContainer = await unitUnderTest.handler(event, context);
      const response = responseContainer.response;

      assert(response.shouldEndSession);
      const restroomDelivered = dummyRestRooms[0];
      const outputSpeech = response.outputSpeech;
      expect(outputSpeech.ssml).to.equal(
        `<speak>I found this restroom near you. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
      );
      expect(outputSpeech.type).to.equal("SSML");

      const card = response.card;
      expect(card.type).to.equal("AskForPermissionsConsent");
      expect(card.permissions).to.eql([scopes.EMAIL_SCOPE]);

      const sentMail = nodemailerMock.mock.getSentMail();
      expect(sentMail.length).to.equal(0);
    }
  });

  it("should not send an email with search results when users searched for restrooms near their device address but hasn't granted permissions to use their email address or we failed to fetch email address due to other service errors.", async () => {
    const event = require("../test-data/nearme_geo_not_supported");

    const coordinates = zipcodes.getCoordinates(DUMMY_POSTAL_CODE);

    // Simulating lack of permissions to fetch user profile information.
    const errorPayload = {
      code: 'ERROR_CODE',
      message: 'some message to indicate the request was not successful',
    };
    const error_codes = [204, 401, 403, 429, 500]
    for (var index = 0; index < error_codes.length; index++) {
      configureUpsService(error_codes[index], event.context, errorPayload);
      configureRRService(200, coordinates.latitude, coordinates.longitude, false, false, dummyRestRooms);
      configureAddressService(200, event.context, aDeviceAddress);

      const responseContainer = await unitUnderTest.handler(event, context);
      const response = responseContainer.response;

      assert(response.shouldEndSession);
      const restroomDelivered = dummyRestRooms[0];
      const outputSpeech = response.outputSpeech;
      expect(outputSpeech.ssml).to.equal(
        `<speak>I found this restroom near you. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
      );
      expect(outputSpeech.type).to.equal("SSML");

      const card = response.card;
      expect(card.type).to.equal("AskForPermissionsConsent");
      expect(card.permissions).to.eql([scopes.EMAIL_SCOPE]);

      const sentMail = nodemailerMock.mock.getSentMail();
      expect(sentMail.length).to.equal(0);
    }
  });

  it("should not send an email with search results when users searched for restrooms by zipcode but hasn't granted permissions to use their email address or we failed to fetch email address due to other service errors.", async () => {
    const event = require("../test-data/atlocation");
    const zipcode = event.session.attributes.zipcode;
    const coordinates = zipcodes.getCoordinates(zipcode);

    // Simulating lack of permissions to fetch user profile information.
    const errorPayload = {
      code: 'ERROR_CODE',
      message: 'some message to indicate the request was not successful',
    };
    const error_codes = [204, 401, 403, 429, 500]
    for (var index = 0; index < error_codes.length; index++) {
      configureUpsService(error_codes[index], event.context, errorPayload);
      configureRRService(200, coordinates.latitude, coordinates.longitude, false, false, dummyRestRooms);

      const responseContainer = await unitUnderTest.handler(event, context);
      const response = responseContainer.response;

      assert(response.shouldEndSession);
      const restroomDelivered = dummyRestRooms[0];
      const outputSpeech = response.outputSpeech;
      expect(outputSpeech.ssml).to.equal(
        `<speak>I found this restroom at <say-as interpret-as="digits">${zipcode}</say-as>. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
      );
      expect(outputSpeech.type).to.equal("SSML");

      const card = response.card;
      expect(card.type).to.equal("AskForPermissionsConsent");
      expect(card.permissions).to.eql([scopes.EMAIL_SCOPE]);

      const sentMail = nodemailerMock.mock.getSentMail();
      expect(sentMail.length).to.equal(0);
    }
  });

  it("should not send an email with search results if the email returned by Alexa is invalid.", async () => {
    const event = require("../test-data/nearme_geo_supported");
    event.context.Geolocation.coordinate.latitudeInDegrees = DUMMY_LATITUDE;
    event.context.Geolocation.coordinate.longitudeInDegrees = DUMMY_LONGITUDE;

    const invalid_email_addresses = ["invalid@email@address.com", null, undefined, "invalid@email", "invalidEmailAddress"];
    for (var index = 0; index < invalid_email_addresses.length; index++) {
      const invalid_email_address = invalid_email_addresses[index];

      configureUpsService(200, event.context, invalid_email_address);
      configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false, dummyRestRooms);

      const responseContainer = await unitUnderTest.handler(event, context);
      const response = responseContainer.response;

      assert(response.shouldEndSession);
      const restroomDelivered = dummyRestRooms[0];
      const outputSpeech = response.outputSpeech;
      expect(outputSpeech.ssml).to.equal(
        `<speak>I found this restroom near you. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
      );
      expect(outputSpeech.type).to.equal("SSML");

      const sentMail = nodemailerMock.mock.getSentMail();
      expect(sentMail.length).to.equal(0);
    }
  });
});

function buildSimpleCardContent(restrooms) {
  let content = ``;

  restrooms.slice(0, 4).forEach(restroom => content += `
${visuallyDescribeRestroom(restroom)}
Directions: ${restroom.directions ? `${restroom.directions}` : `Not Available`}
Unisex: ${restroom.unisex ? 'Yes' : 'No'}, Accessible: ${restroom.accessible ? 'Yes' : 'No'}, Changing Table: ${restroom.changing_table ? 'Yes' : 'No'}
`);

  return content;
}

function configureAddressService(responseCode, context, payload) {
  if (!nock.isActive()) {
    nock.activate();
  }

  nock(context.System.apiEndpoint)
    .get(`/v1/devices/${context.System.device.deviceId}/settings/address/countryAndPostalCode`)
    .query(true)
    .reply(responseCode, JSON.stringify(payload, null, 2));
}

function configureUpsService(responseCode, context, payload) {
  if (!nock.isActive()) {
    nock.activate();
  }

  nock(context.System.apiEndpoint)
    .get(`/v2/accounts/~current/settings/Profile.email`)
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

/**
 * Verify the structure of the APL directives. We check that we are sending exactly
 * one directive and that it is of the right type and version.
 */
function verifyAPLDirectiveStructure(directives) {
  expect(directives).is.not.null;
  expect(directives.length).is.equal(1);

  const directive = directives[0];
  expect(directive.type).to.equal(APL_DOCUMENT_TYPE);
  expect(directive.version).to.equal(APL_DOCUMENT_VERSION);
}
