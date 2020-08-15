const unitUnderTest = require("../src/index");
const cloneDeep = require("lodash.clonedeep");

const expect = require("chai").expect;
const assert = require("chai").assert;
const decache = require("decache");
const nock = require('nock')

const context = {};

const RR = require("gateway/RefugeeRestrooms");
const zipcodes = require("gateway/Zipcodes");

const messages = require("constants/Messages").messages;
const scopes = require("constants/Scopes").scopes;

describe("Finding restaurants near user's geo location", function () {
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

    configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>Placeholder response geo location ${dummyRestRooms[0].name}</speak>`
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

describe("Finding restaurants near device address", function () {
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
    configureRRService(200, coordinates.latitude, coordinates.longitude, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>Placeholder response ${dummyRestRooms[0].name} ${DUMMY_POSTAL_CODE}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });

  it("should render a message and card requesting for device address permissions if said permissions are not already granted by the user", async () => {
    const event = require("../test-data/nearme_geo_not_supported");

    // Simulating lack of permissions to fetch device address.
    event.context.System.apiAccessToken = null;

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>${messages.NOTIFY_MISSING_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.type).to.equal("AskForPermissionsConsent");
    expect(card.permissions).to.eql([scopes.ADDRESS_SCOPE]);
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

function configureAddressService(responseCode, context, payload) {
  if (!nock.isActive()) {
    nock.activate();
  }

  nock(context.System.apiEndpoint)
    .get(`/v1/devices/${context.System.device.deviceId}/settings/address/countryAndPostalCode`)
    .query(true)
    .reply(responseCode, JSON.stringify(payload, null, 2));
}

function configureRRService(responseCode, latitude, longitude, payload) {
  if (!nock.isActive()) {
    nock.activate();
  }

  nock(RR.BASE_URL)
    .get(`/api/v1/restrooms/by_location?page=1&per_page=10&offset=0&lat=${latitude}&lng=${longitude}`)
    .reply(responseCode, JSON.stringify(payload, null, 2));
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

/**
 * Returns a string that is a comma separated list of top suggestions.
 * @param suggestedSpellings The complete list of spellings. Should be a non-empty array.
 * @param numberOfSuggestions The number of top spellings to extract. This should be a
 * positive number. If the number is larger than the size of all spellings available, we
 * will return all spellings.
 */
function topSuggestedSpellings(suggestedSpellings, numberOfSuggestions) {
  if (
    !Array.isArray(suggestedSpellings) ||
    !suggestedSpellings.length ||
    numberOfSuggestions <= 0
  )
    throw `Invalid inputs. suggestedSpellings = ${suggestedSpellings}. numberOfSuggestions = ${numberOfSuggestions}.`;

  let result = "";
  for (
    var i = 0;
    i < numberOfSuggestions && i < suggestedSpellings.length;
    i++
  ) {
    result += suggestedSpellings[i] + ", ";
  }

  return result.substring(0, result.length - 2);
}



/*
Alexa supports Alexa Presentation Language (APL) on only a few devices and
so there is a fork in the code to issue APL directives for devices that support
APL and plain old cards for other devices. This test method generates an array
of two events simulating devices with and without APL support.
*/
function getEventObjects(path) {
  // Events by default are configured to have APL support.
  const event = require(path);

  // Build an event object without APL support.
  const eventWithoutAPLSupport = cloneDeep(event);
  delete eventWithoutAPLSupport.context.System.device.supportedInterfaces["Alexa.Presentation.APL"];

  return [event, eventWithoutAPLSupport];
}

/*
Helper fucntion to tell if APL is supported.
*/
function hasAPLSupport(event) {
  if (
    hasIn(event, [
      "context",
      "System",
      "device",
      "supportedInterfaces",
      "Alexa.Presentation.APL"
    ])
  ) return true;
  else return false;
}
