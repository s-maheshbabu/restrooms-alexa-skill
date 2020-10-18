const unitUnderTest = require("../src/index");
const determinePositiveRatingPercentage = require("../src/utilities").determinePositiveRatingPercentage;

const expect = require("chai").expect;
const assert = require("chai").assert;
const importFresh = require('import-fresh');
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
const GoogleMaps = require("gateway/GoogleMaps");
const DUMMY_GOOGLE_MAPS_API_KEY = "dummyGoogleMapsAPIKey";

const states = require("constants/Constants").states;
const messages = require("constants/Messages").messages;
const scopes = require("constants/Scopes").scopes;
const icons = require("constants/Icons").icons;
const ios = require("constants/Constants").ios;
const android = require("constants/Constants").android;

const APL_CONSTANTS = require("constants/APL");
const APL_DOCUMENT_TYPE = APL_CONSTANTS.APL_DOCUMENT_TYPE;
const APL_DOCUMENT_VERSION = APL_CONSTANTS.APL_DOCUMENT_VERSION;
const restroomDetailsDocument = require("apl/document/RestroomDetailsDocument.json");
const restroomDetailsDatasource = require("apl/data/RestroomDetailsDatasource");

describe("Finding restrooms near user's geo location", function () {
  const DUMMY_LATITUDE = 47.62078857421875;
  const DUMMY_LONGITUDE = -122.30061853955556;

  const dummyRestRooms = importFresh("../test-data/sample-RR-response.json");

  before(async () => {
    await zipcodes.init();
  });

  it("should be able to fetch restrooms near the user's geo location in the happy case where skill has permissions to access their location.", async () => {
    const event = importFresh("../test-data/nearme_geo_supported");
    event.context.Geolocation.coordinate.latitudeInDegrees = DUMMY_LATITUDE;
    event.context.Geolocation.coordinate.longitudeInDegrees = DUMMY_LONGITUDE;

    configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const restroomDelivered = dummyRestRooms[0];
    const distance = roundDownDistance(restroomDelivered.distance);
    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this positively rated restroom ${distance} miles away. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.type).to.equal("AskForPermissionsConsent");
    expect(card.permissions).to.eql([scopes.EMAIL_SCOPE]);

    const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);
    expect(response.directives.length).is.equal(1);
    const directive = response.directives[0];
    verifyAPLDirectiveStructure(directive);
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom near you.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.DISTANCE} ${distance} miles<br>${icons.RATINGS} ${positiveRatingPercentage}% positive`,
        messages.NOTIFY_MISSING_EMAIL_PERMISSIONS,
      )
    );
  });

  it("should let the user know if there are no restrooms near the user's geo location", async () => {
    const event = importFresh("../test-data/nearme_geo_supported");

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
    const event = importFresh("../test-data/nearme_geo_supported");

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
    const event = importFresh("../test-data/nearme_geo_supported");

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
    const event_no_geo_location = importFresh("../test-data/nearme_geo_supported");
    delete event_no_geo_location.context.Geolocation;

    const event_no_coordinates = importFresh("../test-data/nearme_geo_supported");
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
  const dummyRestRooms = importFresh("../test-data/sample-RR-response.json");

  before(async () => {
    await zipcodes.init();
  });

  it("should be able to fetch the postal address in the happy case where skill has permissions to access the device address.", async () => {
    const event = importFresh("../test-data/nearme_geo_not_supported");
    configureAddressService(200, event.context, aDeviceAddress);

    const coordinates = zipcodes.getCoordinates(DUMMY_POSTAL_CODE);
    configureRRService(200, coordinates.latitude, coordinates.longitude, false, false, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const restroomDelivered = dummyRestRooms[0];
    const outputSpeech = response.outputSpeech;
    const distance = roundDownDistance(restroomDelivered.distance);
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this positively rated restroom ${distance} miles away. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.type).to.equal("AskForPermissionsConsent");
    expect(card.permissions).to.eql([scopes.EMAIL_SCOPE]);

    const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);
    expect(response.directives.length).is.equal(1);
    const directive = response.directives[0];
    verifyAPLDirectiveStructure(directive);
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom near you.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.DISTANCE} ${distance} miles<br>${icons.RATINGS} ${positiveRatingPercentage}% positive`,
        messages.NOTIFY_MISSING_EMAIL_PERMISSIONS,
      )
    );
  });

  it("should let the user know if there are no restrooms near the user's geo location", async () => {
    const event = importFresh("../test-data/nearme_geo_not_supported");
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
    const event = importFresh("../test-data/nearme_geo_not_supported");

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
    const event = importFresh("../test-data/nearme_geo_not_supported");

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
    const event = importFresh("../test-data/nearme_geo_not_supported");

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
    const event = importFresh("../test-data/nearme_geo_not_supported");

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
    const event = importFresh("../test-data/nearme_geo_not_supported");

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
  const dummyRestRooms = importFresh("../test-data/sample-RR-response.json");

  before(async () => {
    await zipcodes.init();
  });

  it("should be able to find restrooms at the location specified by the user.", async () => {
    const event = importFresh("../test-data/atlocation");

    const zipcode = event.session.attributes.zipcode;
    const coordinates = zipcodes.getCoordinates(zipcode);
    configureRRService(200, coordinates.latitude, coordinates.longitude, false, false, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const restroomDelivered = dummyRestRooms[0];
    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this positively rated restroom at <say-as interpret-as="digits">${zipcode}</say-as>. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.type).to.equal("AskForPermissionsConsent");
    expect(card.permissions).to.eql([scopes.EMAIL_SCOPE]);

    const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);
    expect(response.directives.length).is.equal(1);
    const directive = response.directives[0];
    verifyAPLDirectiveStructure(directive);
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom at ${zipcode}.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.RATINGS} ${positiveRatingPercentage}% positive`,
        messages.NOTIFY_MISSING_EMAIL_PERMISSIONS,
      )
    );
  });

  it("should let the user know if there are no restrooms in the location they are searching for", async () => {
    const event = importFresh("../test-data/atlocation");

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
    const event = importFresh("../test-data/atlocation");

    const anInvalidZipCode = "an-invalid-zipcode";
    event.session.attributes.zipcode = anInvalidZipCode;

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>Sorry. I'm unable to find any restrooms at <say-as interpret-as="digits">${anInvalidZipCode}</say-as>. Good bye.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });
});

describe("Finding restrooms at a user specified address", function () {
  const DUMMY_LATITUDE = 47.62078857421875;
  const DUMMY_LONGITUDE = -122.30061853955556;

  const US_COUNTRY_CODE = "US";
  const DUMMY_POSTAL_CODE = "77840";

  const aDeviceAddress = {
    countryCode: US_COUNTRY_CODE,
    postalCode: DUMMY_POSTAL_CODE,
  };

  const dummyRestRooms = importFresh("../test-data/sample-RR-response.json");
  const dummyGoogleMapsResponse = importFresh("../test-data/sample-GoogleMaps-response.json");

  before(async () => {
    process.env.GOOGLE_MAPS_API_KEY = DUMMY_GOOGLE_MAPS_API_KEY;
    await zipcodes.init();
  });

  after(function () {
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  // TODO Should we test the combinations of street+city and street+state addresses?
  it("should be able to find restrooms at the full address specified by the user. Even if we have the users geocoordinates and device address, we should not place any bounds on the geocode lookup of the specified address.", async () => {
    const event = importFresh("../test-data/atAddress_geo_supported");
    event.session.attributes.street = "six oh one union street";
    const sanitizedStreetAddress = "601 union street";

    const city = event.session.attributes.city;
    const state = event.session.attributes.state;

    configureGoogleMapsService(200, `${sanitizedStreetAddress} ${city} ${state}`, dummyGoogleMapsResponse);
    const latitude = dummyGoogleMapsResponse.results[0].geometry.location.lat;
    const longitude = dummyGoogleMapsResponse.results[0].geometry.location.lng;
    configureRRService(200, latitude, longitude, false, true, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const restroomDelivered = dummyRestRooms[0];
    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this positively rated restroom at given address. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.type).to.equal("AskForPermissionsConsent");
    expect(card.permissions).to.eql([scopes.EMAIL_SCOPE]);

    const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);
    const directive = response.directives[0];
    verifyAPLDirectiveStructure(directive);
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom at given address.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.RATINGS} ${positiveRatingPercentage}% positive`,
        messages.NOTIFY_MISSING_EMAIL_PERMISSIONS,
      )
    );
  });

  it("when user specifies only the street address, there can be multiple matches across the country. So, if they are on a mobile device, we should use their geo coordinates to influence the search for restrooms.", async () => {
    const event = importFresh("../test-data/atAddress_geo_supported");
    event.context.Geolocation.coordinate.latitudeInDegrees = DUMMY_LATITUDE;
    event.context.Geolocation.coordinate.longitudeInDegrees = DUMMY_LONGITUDE;

    event.session.attributes.street = "six oh one union street";
    const sanitizedStreetAddress = "601 union street";

    event.session.attributes.city = undefined;
    event.session.attributes.state = undefined;

    configureGoogleMapsServiceWithBounds(200, sanitizedStreetAddress, DUMMY_LATITUDE, DUMMY_LONGITUDE, dummyGoogleMapsResponse);
    const latitude = dummyGoogleMapsResponse.results[0].geometry.location.lat;
    const longitude = dummyGoogleMapsResponse.results[0].geometry.location.lng;
    configureRRService(200, latitude, longitude, false, true, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const restroomDelivered = dummyRestRooms[0];
    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this positively rated restroom at given address. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.type).to.equal("AskForPermissionsConsent");
    expect(card.permissions).to.eql([scopes.EMAIL_SCOPE]);

    const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);
    const directive = response.directives[0];
    verifyAPLDirectiveStructure(directive);
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom at given address.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.RATINGS} ${positiveRatingPercentage}% positive`,
        messages.NOTIFY_MISSING_EMAIL_PERMISSIONS,
      )
    );
  });

  it("when user specifies only the street address, there can be multiple matches across the country. So, if they are on a mobile device, we should use their geo coordinates to influence the search for restrooms. However, if we don't have permissions to use the coordinates, we should still move forward with an unbounded search.", async () => {
    const event = importFresh("../test-data/atAddress");

    // Simulating lack of permissions to fetch user's geo address.
    event.context.System.user.permissions.scopes['alexa::devices:all:geolocation:read'].status = "any value except GRANTED";

    event.session.attributes.street = "six oh one union street";
    const sanitizedStreetAddress = "601 union street";

    event.session.attributes.city = undefined;
    event.session.attributes.state = undefined;

    configureGoogleMapsService(200, sanitizedStreetAddress, dummyGoogleMapsResponse);
    const latitude = dummyGoogleMapsResponse.results[0].geometry.location.lat;
    const longitude = dummyGoogleMapsResponse.results[0].geometry.location.lng;
    configureRRService(200, latitude, longitude, false, true, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const restroomDelivered = dummyRestRooms[0];
    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this positively rated restroom at given address. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.type).to.equal("AskForPermissionsConsent");
    expect(card.permissions).to.eql([scopes.EMAIL_SCOPE]);

    const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);
    const directive = response.directives[0];
    verifyAPLDirectiveStructure(directive);
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom at given address.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.RATINGS} ${positiveRatingPercentage}% positive`,
        messages.NOTIFY_MISSING_EMAIL_PERMISSIONS,
      )
    );
  });

  it("when user specifies only the street address, there can be multiple matches across the country. So, if they are on a home device like Echo Dot, we should use their zipcode to influence the search for restrooms.", async () => {
    const event = importFresh("../test-data/atAddress");

    event.session.attributes.street = "six oh one union street";
    const sanitizedStreetAddress = "601 union street";

    event.session.attributes.city = undefined;
    event.session.attributes.state = undefined;

    configureAddressService(200, event.context, aDeviceAddress);
    const coordinates = zipcodes.getCoordinates(DUMMY_POSTAL_CODE);
    configureGoogleMapsServiceWithBounds(200, sanitizedStreetAddress, coordinates.latitude, coordinates.longitude, dummyGoogleMapsResponse);

    const latitude = dummyGoogleMapsResponse.results[0].geometry.location.lat;
    const longitude = dummyGoogleMapsResponse.results[0].geometry.location.lng;
    configureRRService(200, latitude, longitude, false, true, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const restroomDelivered = dummyRestRooms[0];
    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this positively rated restroom at given address. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.type).to.equal("AskForPermissionsConsent");
    expect(card.permissions).to.eql([scopes.EMAIL_SCOPE]);

    const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);
    const directive = response.directives[0];
    verifyAPLDirectiveStructure(directive);
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom at given address.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.RATINGS} ${positiveRatingPercentage}% positive`,
        messages.NOTIFY_MISSING_EMAIL_PERMISSIONS,
      )
    );
  });

  it("when user specifies only the street address, there can be multiple matches across the country. So, if they are on a home device like Echo Dot, we should use their zipcode to influence the search for restrooms. However, if we don't have permissions to use the zipcode, we should still move forward with an unbounded search.", async () => {
    const event = importFresh("../test-data/atAddress");

    // Simulating lack of permissions to fetch device address.
    const accessDeniedPayload = {
      code: 'ACCESS_DENIED',
      message: 'access denied to requested resource'
    };
    configureAddressService(403, event.context, accessDeniedPayload);

    event.session.attributes.street = "six oh one union street";
    const sanitizedStreetAddress = "601 union street";

    event.session.attributes.city = undefined;
    event.session.attributes.state = undefined;

    configureAddressService(200, event.context, aDeviceAddress);
    configureGoogleMapsService(200, sanitizedStreetAddress, dummyGoogleMapsResponse);

    const latitude = dummyGoogleMapsResponse.results[0].geometry.location.lat;
    const longitude = dummyGoogleMapsResponse.results[0].geometry.location.lng;
    configureRRService(200, latitude, longitude, false, true, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const restroomDelivered = dummyRestRooms[0];
    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this positively rated restroom at given address. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.type).to.equal("AskForPermissionsConsent");
    expect(card.permissions).to.eql([scopes.EMAIL_SCOPE]);

    const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);
    const directive = response.directives[0];
    verifyAPLDirectiveStructure(directive);
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom at given address.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.RATINGS} ${positiveRatingPercentage}% positive`,
        messages.NOTIFY_MISSING_EMAIL_PERMISSIONS,
      )
    );
  });

  it("should let the user know if the address they provided is not parseable.", async () => {
    const event = importFresh("../test-data/atAddress");
    event.session.attributes.street = "two one forty eighth avenue";

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I am sorry but I currently do not support addresses with numbered streets like twenty fourth avenue, eigth street etc. Good bye.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });

  it("should let the user know if there are no restrooms in the address they are searching for", async () => {
    const event = importFresh("../test-data/atAddress");

    const street = event.session.attributes.street;
    const city = event.session.attributes.city;
    const state = event.session.attributes.state;

    configureGoogleMapsService(200, `${street}${city ? ` ${city}` : ''}${state ? ` ${state}` : ''}`, dummyGoogleMapsResponse);
    const latitude = dummyGoogleMapsResponse.results[0].geometry.location.lat;
    const longitude = dummyGoogleMapsResponse.results[0].geometry.location.lng;
    const emptyRestroomsResult = [];
    configureRRService(200, latitude, longitude, false, true, emptyRestroomsResult);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I'm sorry. I couldn't find any restrooms at given address matching your criteria.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });

  it("should render an error message if we are unable to locate the address. Google Maps almost always returns results even if the address is invalid using partial matches. If Google Maps did not return any results, the address is incomprehensibly wrong. Probably a misrecognition by Alexa.", async () => {
    const event = importFresh("../test-data/atAddress");
    const street = event.session.attributes.street = "some";
    const city = event.session.attributes.city = "incomprehensibly wrong";
    const state = event.session.attributes.state = "address";

    const emptyGoogleMapsResponse = {
      results: [],
      status: "ZERO_RESULTS"
    };
    configureGoogleMapsService(200, `${street}${city ? ` ${city}` : ''}${state ? ` ${state}` : ''}`, emptyGoogleMapsResponse);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>Sorry. Given address is not a valid address in the US. Please try again with a valid US based address.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });

  it("should render an error message to the user if we get an error from Google Maps", async () => {
    const event = importFresh("../test-data/atAddress");

    const street = event.session.attributes.street;
    const city = event.session.attributes.city;
    const state = event.session.attributes.state;

    const error_codes = [400, 401, 403, 404, 409, 429, 500, 501, 503, 504];
    for (var i = 0; i < error_codes.length; i++) {
      configureGoogleMapsService(error_codes[i], `${street}${city ? ` ${city}` : ''}${state ? ` ${state}` : ''}`, {});
      // Error codes above 409 are retried automatically. So mock it one more time so Nock won't complain about not having a matching mock on retry.
      if (error_codes[i] > 409)
        configureGoogleMapsService(error_codes[i], `${street}${city ? ` ${city}` : ''}${state ? ` ${state}` : ''}`, {});

      const responseContainer = await unitUnderTest.handler(event, context);

      const response = responseContainer.response;
      assert(response.shouldEndSession);

      const outputSpeech = response.outputSpeech;
      expect(outputSpeech.ssml).to.equal(
        `<speak>I'm Sorry, I'm having trouble helping you. Please try again later.</speak>`
      );
      expect(outputSpeech.type).to.equal("SSML");
    }
  });
});

describe("Honor search filters when searching for restrooms near the user's location", function () {
  const dummyRestRooms = importFresh("../test-data/sample-RR-response.json");

  before(async () => {
    await zipcodes.init();
  });

  it("should be able to fetch restrooms when user filters for accessible & unisex restrooms", async () => {
    const event = importFresh("../test-data/nearme_ada_unisex_filters");
    const latitude = event.context.Geolocation.coordinate.latitudeInDegrees;
    const longitude = event.context.Geolocation.coordinate.longitudeInDegrees;

    configureRRService(200, latitude, longitude, true, true, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this positively rated restroom ${roundDownDistance(dummyRestRooms[0].distance)} miles away. ${describeRestroom(dummyRestRooms[0])}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });

  it("should be able to fetch restrooms when user filters for accessible restrooms", async () => {
    const event = importFresh("../test-data/nearme_ada_filters");
    const latitude = event.context.Geolocation.coordinate.latitudeInDegrees;
    const longitude = event.context.Geolocation.coordinate.longitudeInDegrees;

    configureRRService(200, latitude, longitude, true, false, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this positively rated restroom ${roundDownDistance(dummyRestRooms[0].distance)} miles away. ${describeRestroom(dummyRestRooms[0])}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });

  it("should be able to fetch restrooms when user filters for unisex restrooms", async () => {
    const event = importFresh("../test-data/nearme_unisex_filters");
    const latitude = event.context.Geolocation.coordinate.latitudeInDegrees;
    const longitude = event.context.Geolocation.coordinate.longitudeInDegrees;

    configureRRService(200, latitude, longitude, false, true, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this positively rated restroom ${roundDownDistance(dummyRestRooms[0].distance)} miles away. ${describeRestroom(dummyRestRooms[0])}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");
  });

  it("should be able to fetch restrooms when user filters for accessible & unisex & changing_table restrooms. Refugee Restrooms does not support filtering by changing_table restrooms and so we filter it ourselves. Hence this additional test.", async () => {
    const event = importFresh("../test-data/nearme_ada_unisex_changing_table_filters");
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
      `<speak>I found this restroom ${roundDownDistance(firstRestroomWithChangingTable.distance)} miles away. ${describeRestroom(firstRestroomWithChangingTable)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    // once we start navigating through all restrooms, assertions can get better here. Count the number of changing table restrooms in dummyRestrooms and
    // assert that we are only presenting that many restrooms and that all restrooms we are presenting to the user have changing tables.
  });
});

describe("APL directives support", function () {
  const DUMMY_LATITUDE = 47.62078857421875;
  const DUMMY_LONGITUDE = -122.30061853955556;

  const dummyRestRooms = importFresh("../test-data/sample-RR-response.json");

  before(async () => {
    await zipcodes.init();
  });

  it("should not include the APL directives when the device does not support APL.", async () => {
    const event = importFresh("../test-data/nearme_geo_supported_no_apl");
    event.context.Geolocation.coordinate.latitudeInDegrees = DUMMY_LATITUDE;
    event.context.Geolocation.coordinate.longitudeInDegrees = DUMMY_LONGITUDE;

    configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const restroomDelivered = dummyRestRooms[0];
    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this positively rated restroom ${roundDownDistance(restroomDelivered.distance)} miles away. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    expect(response.directives.length).to.eql(0);
  });

  it("the features of the restroom should be accurately represented in the APL visual.", async () => {
    const event = importFresh("../test-data/nearme_geo_supported");
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
      const distance = roundDownDistance(restroomDelivered.distance);
      expect(outputSpeech.ssml).to.equal(
        `<speak>I found this positively rated restroom ${distance} miles away. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
      );
      expect(outputSpeech.type).to.equal("SSML");

      const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);
      expect(response.directives.length).is.equal(1);
      const directive = response.directives[0];
      verifyAPLDirectiveStructure(directive);
      expect(directive.document).to.eql(restroomDetailsDocument);
      const actualDatasource = directive.datasources;
      expect(actualDatasource).to.eql(
        restroomDetailsDatasource(
          `Here is a restroom near you.`,
          `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
          `${isUnisex ? `${icons.GREEN_CHECKMARK}` : `${icons.RED_CROSSMARK}`} Gender Neutral<br>${isAccessible ? `${icons.GREEN_CHECKMARK}` : `${icons.RED_CROSSMARK}`} Accessible<br>${isChangingTable ? `${icons.GREEN_CHECKMARK}` : `${icons.RED_CROSSMARK}`} Changing Table<br>${icons.DISTANCE} ${distance} miles<br>${icons.RATINGS} ${positiveRatingPercentage}% positive`,
          messages.NOTIFY_MISSING_EMAIL_PERMISSIONS,
        )
      );
    }
  });
});

describe("Sending emails", function () {
  const FROM_EMAIL_ADDRESS = "Refugee Restrooms <refugee.restrooms@gmail.com>";
  const DUMMY_EMAIL_ADDRESS = "success@simulator.amazonses.com";

  const DUMMY_LATITUDE = 47.62078857421875;
  const DUMMY_LONGITUDE = -122.30061853955556;

  const US_COUNTRY_CODE = "US";
  const DUMMY_POSTAL_CODE = "77840";

  const aDeviceAddress = {
    countryCode: US_COUNTRY_CODE,
    postalCode: DUMMY_POSTAL_CODE,
  };

  const dummyRestRooms = importFresh("../test-data/sample-RR-response.json");

  before(async () => {
    await zipcodes.init();

    mockery.enable({ warnOnUnregistered: false });
    mockery.registerMock('nodemailer', nodemailerMock);
    await Mailer.init(transporter);
  });

  afterEach(function () {
    nodemailerMock.mock.reset();
  });

  after(async () => {
    mockery.deregisterAll();
    mockery.disable();
  });

  it("should send an email to the user with search results when users searched for restrooms near their geo location and have granted permission to use their email.", async () => {
    const event = importFresh("../test-data/nearme_geo_supported");
    event.context.Geolocation.coordinate.latitudeInDegrees = DUMMY_LATITUDE;
    event.context.Geolocation.coordinate.longitudeInDegrees = DUMMY_LONGITUDE;

    configureUpsService(200, event.context, DUMMY_EMAIL_ADDRESS);
    configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false, dummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);
    const response = responseContainer.response;

    assert(response.shouldEndSession);
    const restroomDelivered = dummyRestRooms[0];
    const outputSpeech = response.outputSpeech;
    const distance = roundDownDistance(restroomDelivered.distance);
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this positively rated restroom ${distance} miles away. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.title).to.equal("Here are some restrooms near you.");
    expect(card.type).to.equal("Simple");
    expect(card.content).to.equal(buildSimpleCardContent(dummyRestRooms));

    const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);
    expect(response.directives.length).is.equal(1);
    const directive = response.directives[0];
    verifyAPLDirectiveStructure(directive);
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom near you.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.DISTANCE} ${distance} miles<br>${icons.RATINGS} ${positiveRatingPercentage}% positive`,
        `I also sent this and other restrooms I found to your email. I also included Google Maps™ navigation links in the email.`,
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
    const event = importFresh("../test-data/nearme_geo_not_supported");
    configureAddressService(200, event.context, aDeviceAddress);

    const coordinates = zipcodes.getCoordinates(DUMMY_POSTAL_CODE);
    configureRRService(200, coordinates.latitude, coordinates.longitude, false, false, dummyRestRooms);

    configureUpsService(200, event.context, DUMMY_EMAIL_ADDRESS);

    const responseContainer = await unitUnderTest.handler(event, context);
    const response = responseContainer.response;

    assert(response.shouldEndSession);
    const restroomDelivered = dummyRestRooms[0];
    const outputSpeech = response.outputSpeech;
    const distance = roundDownDistance(restroomDelivered.distance);
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this positively rated restroom ${distance} miles away. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.title).to.equal("Here are some restrooms near you.");
    expect(card.type).to.equal("Simple");
    expect(card.content).to.equal(buildSimpleCardContent(dummyRestRooms));

    const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);
    expect(response.directives.length).is.equal(1);
    const directive = response.directives[0];
    verifyAPLDirectiveStructure(directive);
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom near you.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.DISTANCE} ${distance} miles<br>${icons.RATINGS} ${positiveRatingPercentage}% positive`,
        `I also sent this and other restrooms I found to your email. I also included Google Maps™ navigation links in the email.`,
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
    const event = importFresh("../test-data/atlocation");
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
      `<speak>I found this positively rated restroom at <say-as interpret-as="digits">${zipcode}</say-as>. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.title).to.equal(`Here are some restrooms at ${zipcode}`);
    expect(card.type).to.equal("Simple");
    expect(card.content).to.equal(buildSimpleCardContent(dummyRestRooms));

    const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);
    expect(response.directives.length).is.equal(1);
    const directive = response.directives[0];
    verifyAPLDirectiveStructure(directive);
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom at ${zipcode}.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.RATINGS} ${positiveRatingPercentage}% positive`,
        `I also sent this and other restrooms I found to your email. I also included Google Maps™ navigation links in the email.`,
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
    const event = importFresh("../test-data/nearme_geo_supported");
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
        `<speak>I found this positively rated restroom ${roundDownDistance(restroomDelivered.distance)} miles away. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
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
    const event = importFresh("../test-data/nearme_geo_not_supported");

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
        `<speak>I found this positively rated restroom ${roundDownDistance(restroomDelivered.distance)} miles away. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
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
    const event = importFresh("../test-data/atlocation");
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
        `<speak>I found this positively rated restroom at <say-as interpret-as="digits">${zipcode}</say-as>. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
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
    const event = importFresh("../test-data/nearme_geo_supported");
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
        `<speak>I found this positively rated restroom ${roundDownDistance(restroomDelivered.distance)} miles away. ${describeRestroom(restroomDelivered)}. ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}</speak>`
      );
      expect(outputSpeech.type).to.equal("SSML");

      const sentMail = nodemailerMock.mock.getSentMail();
      expect(sentMail.length).to.equal(0);
    }
  });
});

describe("Convey ratings of the restrooms", function () {
  const DUMMY_LATITUDE = 47.62078857421875;
  const DUMMY_LONGITUDE = -122.30061853955556; const US_COUNTRY_CODE = "US";
  const DUMMY_POSTAL_CODE = "77840";

  const aDeviceAddress = {
    countryCode: US_COUNTRY_CODE,
    postalCode: DUMMY_POSTAL_CODE,
  };

  const DUMMY_EMAIL_ADDRESS = "success@simulator.amazonses.com";

  const dummyRestRooms = importFresh("../test-data/sample-RR-response.json");

  before(async () => {
    await zipcodes.init();

    mockery.enable({ warnOnUnregistered: false });
    mockery.registerMock('nodemailer', nodemailerMock);
    await Mailer.init(transporter);
  });

  let clonedDummyRestRooms;
  beforeEach(async () => {
    clonedDummyRestRooms = cloneDeep(dummyRestRooms);
  });

  afterEach(function () {
    nodemailerMock.mock.reset();
  });

  after(async () => {
    mockery.deregisterAll();
    mockery.disable();
  });

  it("should convey the information when we find a highly rated restrooms when searching for restrooms by geo location.", async () => {
    const event = importFresh("../test-data/nearme_geo_supported");
    event.context.Geolocation.coordinate.latitudeInDegrees = DUMMY_LATITUDE;
    event.context.Geolocation.coordinate.longitudeInDegrees = DUMMY_LONGITUDE;

    const restroomDelivered = clonedDummyRestRooms[0];
    const highlyRatedRestRoomVoteCombinations = [[70, 30], [71, 30], [1, 0], [1000, 0]];
    for (const combination of highlyRatedRestRoomVoteCombinations) {
      restroomDelivered.upvote = combination[0];
      restroomDelivered.downvote = combination[1];
      const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);
      configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false, clonedDummyRestRooms);

      configureUpsService(200, event.context, DUMMY_EMAIL_ADDRESS);

      const responseContainer = await unitUnderTest.handler(event, context);

      const response = responseContainer.response;
      assert(response.shouldEndSession);

      const distance = roundDownDistance(restroomDelivered.distance);
      const outputSpeech = response.outputSpeech;
      expect(outputSpeech.ssml).to.equal(
        `<speak>I found this positively rated restroom ${distance} miles away. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email.</speak>`
      );
      expect(outputSpeech.type).to.equal("SSML");

      const card = response.card;
      expect(card.title).to.equal("Here are some restrooms near you.");
      expect(card.type).to.equal("Simple");
      expect(card.content).to.equal(buildSimpleCardContent(clonedDummyRestRooms));

      expect(response.directives.length).is.equal(1);
      const directive = response.directives[0];
      verifyAPLDirectiveStructure(directive);
      expect(directive.document).to.eql(restroomDetailsDocument);
      const actualDatasource = directive.datasources;
      expect(actualDatasource).to.eql(
        restroomDetailsDatasource(
          `Here is a restroom near you.`,
          `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
          `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.DISTANCE} ${distance} miles<br>${icons.RATINGS} ${positiveRatingPercentage}% positive`,
          `I also sent this and other restrooms I found to your email. I also included Google Maps™ navigation links in the email.`,
        )
      );

      const sentMail = nodemailerMock.mock.getSentMail();
      const htmlBody = sentMail[0].html;
      expect(htmlBody.includes(`${icons.RATINGS} ${positiveRatingPercentage}% positive`)).to.be.true;
    }
  });

  it("should not call out rating in  prompts if we find a not so highly rated restroom when searching for restrooms by geo location. We should still show the rating in visual results.", async () => {
    const event = importFresh("../test-data/nearme_geo_supported");
    event.context.Geolocation.coordinate.latitudeInDegrees = DUMMY_LATITUDE;
    event.context.Geolocation.coordinate.longitudeInDegrees = DUMMY_LONGITUDE;

    const restroomDelivered = clonedDummyRestRooms[0];
    const highlyRatedRestRoomVoteCombinations = [[69, 30], [30, 30], [0, 1000]];
    for (const combination of highlyRatedRestRoomVoteCombinations) {
      console.log(combination)
      restroomDelivered.upvote = combination[0];
      restroomDelivered.downvote = combination[1];
      const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);

      configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false, clonedDummyRestRooms);

      configureUpsService(200, event.context, DUMMY_EMAIL_ADDRESS);

      const responseContainer = await unitUnderTest.handler(event, context);

      const response = responseContainer.response;
      assert(response.shouldEndSession);

      const distance = roundDownDistance(restroomDelivered.distance);
      const outputSpeech = response.outputSpeech;
      expect(outputSpeech.ssml).to.equal(
        `<speak>I found this restroom ${distance} miles away. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email.</speak>`
      );
      expect(outputSpeech.type).to.equal("SSML");

      const card = response.card;
      expect(card.title).to.equal("Here are some restrooms near you.");
      expect(card.type).to.equal("Simple");
      expect(card.content).to.equal(buildSimpleCardContent(clonedDummyRestRooms));

      expect(response.directives.length).is.equal(1);
      const directive = response.directives[0];
      verifyAPLDirectiveStructure(directive);
      expect(directive.document).to.eql(restroomDetailsDocument);
      const actualDatasource = directive.datasources;
      expect(actualDatasource).to.eql(
        restroomDetailsDatasource(
          `Here is a restroom near you.`,
          `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
          `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.DISTANCE} ${distance} miles<br>${icons.RATINGS} ${positiveRatingPercentage}% positive`,
          `I also sent this and other restrooms I found to your email. I also included Google Maps™ navigation links in the email.`,
        )
      );

      const sentMail = nodemailerMock.mock.getSentMail();
      const htmlBody = sentMail[0].html;
      expect(htmlBody.includes(`${icons.RATINGS} ${positiveRatingPercentage}% positive`)).to.be.true;

      nodemailerMock.mock.reset();
    }
  });

  it("should not call out rating in  prompts if we find an unrated restroom when searching for restrooms by geo location. We should still show that the restroom is unreated in visual results.", async () => {
    const event = importFresh("../test-data/nearme_geo_supported");
    event.context.Geolocation.coordinate.latitudeInDegrees = DUMMY_LATITUDE;
    event.context.Geolocation.coordinate.longitudeInDegrees = DUMMY_LONGITUDE;

    const restroomDelivered = clonedDummyRestRooms[0];
    restroomDelivered.upvote = 0;
    restroomDelivered.downvote = 0;
    configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false, clonedDummyRestRooms);

    configureUpsService(200, event.context, DUMMY_EMAIL_ADDRESS);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const distance = roundDownDistance(restroomDelivered.distance);
    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this restroom ${distance} miles away. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.title).to.equal("Here are some restrooms near you.");
    expect(card.type).to.equal("Simple");
    expect(card.content).to.equal(buildSimpleCardContent(clonedDummyRestRooms));

    expect(response.directives.length).is.equal(1);
    const directive = response.directives[0];
    verifyAPLDirectiveStructure(directive);
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom near you.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.DISTANCE} ${distance} miles<br>${icons.RATINGS} Not Rated`,
        `I also sent this and other restrooms I found to your email. I also included Google Maps™ navigation links in the email.`,
      )
    );

    const sentMail = nodemailerMock.mock.getSentMail();
    const htmlBody = sentMail[0].html;
    expect(htmlBody.includes(`${icons.RATINGS} Not Rated`)).to.be.true;
  });

  it("should convey the information when we find a highly rated restrooms when searching for restrooms by device address.", async () => {
    const event = importFresh("../test-data/nearme_geo_not_supported");

    const restroomDelivered = clonedDummyRestRooms[0];
    const highlyRatedRestRoomVoteCombinations = [[70, 30], [71, 30], [1, 0], [1000, 0]];
    for (const combination of highlyRatedRestRoomVoteCombinations) {
      restroomDelivered.upvote = combination[0];
      restroomDelivered.downvote = combination[1];
      const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);

      const coordinates = zipcodes.getCoordinates(DUMMY_POSTAL_CODE);
      configureRRService(200, coordinates.latitude, coordinates.longitude, false, false, clonedDummyRestRooms);

      configureUpsService(200, event.context, DUMMY_EMAIL_ADDRESS);
      configureAddressService(200, event.context, aDeviceAddress);

      const responseContainer = await unitUnderTest.handler(event, context);

      const response = responseContainer.response;
      assert(response.shouldEndSession);

      const distance = roundDownDistance(restroomDelivered.distance);
      const outputSpeech = response.outputSpeech;
      expect(outputSpeech.ssml).to.equal(
        `<speak>I found this positively rated restroom ${distance} miles away. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email.</speak>`
      );
      expect(outputSpeech.type).to.equal("SSML");

      const card = response.card;
      expect(card.title).to.equal("Here are some restrooms near you.");
      expect(card.type).to.equal("Simple");
      expect(card.content).to.equal(buildSimpleCardContent(clonedDummyRestRooms));

      expect(response.directives.length).is.equal(1);
      const directive = response.directives[0];
      verifyAPLDirectiveStructure(directive);
      expect(directive.document).to.eql(restroomDetailsDocument);
      const actualDatasource = directive.datasources;
      expect(actualDatasource).to.eql(
        restroomDetailsDatasource(
          `Here is a restroom near you.`,
          `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
          `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.DISTANCE} ${distance} miles<br>${icons.RATINGS} ${positiveRatingPercentage}% positive`,
          `I also sent this and other restrooms I found to your email. I also included Google Maps™ navigation links in the email.`,
        )
      );

      const sentMail = nodemailerMock.mock.getSentMail();
      const htmlBody = sentMail[0].html;
      expect(htmlBody.includes(`${icons.RATINGS} ${positiveRatingPercentage}% positive`)).to.be.true;
    }
  });

  it("should not call out rating in  prompts if we find a not so highly rated restroom when searching for restrooms by device address. We should still show the rating in visual results.", async () => {
    const event = importFresh("../test-data/nearme_geo_not_supported");

    const restroomDelivered = clonedDummyRestRooms[0];
    const highlyRatedRestRoomVoteCombinations = [[69, 30], [30, 30], [0, 0], [0, 1000]];
    for (const combination of highlyRatedRestRoomVoteCombinations) {
      restroomDelivered.upvote = combination[0];
      restroomDelivered.downvote = combination[1];
      const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);

      const coordinates = zipcodes.getCoordinates(DUMMY_POSTAL_CODE);
      configureRRService(200, coordinates.latitude, coordinates.longitude, false, false, clonedDummyRestRooms);

      configureUpsService(200, event.context, DUMMY_EMAIL_ADDRESS);
      configureAddressService(200, event.context, aDeviceAddress);

      const responseContainer = await unitUnderTest.handler(event, context);

      const response = responseContainer.response;
      assert(response.shouldEndSession);

      const distance = roundDownDistance(restroomDelivered.distance);
      const outputSpeech = response.outputSpeech;
      expect(outputSpeech.ssml).to.equal(
        `<speak>I found this restroom ${distance} miles away. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email.</speak>`
      );
      expect(outputSpeech.type).to.equal("SSML");

      const card = response.card;
      expect(card.title).to.equal("Here are some restrooms near you.");
      expect(card.type).to.equal("Simple");
      expect(card.content).to.equal(buildSimpleCardContent(clonedDummyRestRooms));

      expect(response.directives.length).is.equal(1);
      const directive = response.directives[0];
      verifyAPLDirectiveStructure(directive);
      expect(directive.document).to.eql(restroomDetailsDocument);
      const actualDatasource = directive.datasources;
      expect(actualDatasource).to.eql(
        restroomDetailsDatasource(
          `Here is a restroom near you.`,
          `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
          `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.DISTANCE} ${distance} miles<br>${icons.RATINGS} ${Number.isInteger(positiveRatingPercentage) ? `${positiveRatingPercentage}% positive` : `Not Rated`}`,
          `I also sent this and other restrooms I found to your email. I also included Google Maps™ navigation links in the email.`,
        )
      );

      const sentMail = nodemailerMock.mock.getSentMail();
      const htmlBody = sentMail[0].html;
      expect(htmlBody.includes(`${icons.RATINGS} ${Number.isInteger(positiveRatingPercentage) ? `${positiveRatingPercentage}% positive` : `Not Rated`}`)).to.be.true;

      nodemailerMock.mock.reset();
    }
  });

  it("should not call out rating in  prompts if we find an unrated restroom when searching for restrooms by device address. We should still show that the restroom is unreated in visual results.", async () => {
    const event = importFresh("../test-data/nearme_geo_not_supported");
    configureAddressService(200, event.context, aDeviceAddress);

    const restroomDelivered = clonedDummyRestRooms[0];
    restroomDelivered.upvote = 0;
    restroomDelivered.downvote = 0;

    const coordinates = zipcodes.getCoordinates(DUMMY_POSTAL_CODE);
    configureRRService(200, coordinates.latitude, coordinates.longitude, false, false, clonedDummyRestRooms);

    configureUpsService(200, event.context, DUMMY_EMAIL_ADDRESS);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const distance = roundDownDistance(restroomDelivered.distance);
    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this restroom ${distance} miles away. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.title).to.equal("Here are some restrooms near you.");
    expect(card.type).to.equal("Simple");
    expect(card.content).to.equal(buildSimpleCardContent(clonedDummyRestRooms));

    expect(response.directives.length).is.equal(1);
    const directive = response.directives[0];
    verifyAPLDirectiveStructure(directive);
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom near you.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.DISTANCE} ${distance} miles<br>${icons.RATINGS} Not Rated`,
        `I also sent this and other restrooms I found to your email. I also included Google Maps™ navigation links in the email.`,
      )
    );

    const sentMail = nodemailerMock.mock.getSentMail();
    const htmlBody = sentMail[0].html;
    expect(htmlBody.includes(`${icons.RATINGS} Not Rated`)).to.be.true;
  });

  it("should convey the information when we find a highly rated restrooms when searching for restrooms by location.", async () => {
    const event = importFresh("../test-data/atlocation");

    const restroomDelivered = clonedDummyRestRooms[0];
    const highlyRatedRestRoomVoteCombinations = [[70, 30], [71, 30], [1, 0], [1000, 0]];
    for (const combination of highlyRatedRestRoomVoteCombinations) {
      restroomDelivered.upvote = combination[0];
      restroomDelivered.downvote = combination[1];
      const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);

      const zipcode = event.session.attributes.zipcode;
      const coordinates = zipcodes.getCoordinates(zipcode);
      configureRRService(200, coordinates.latitude, coordinates.longitude, false, false, clonedDummyRestRooms);

      configureUpsService(200, event.context, DUMMY_EMAIL_ADDRESS);

      const responseContainer = await unitUnderTest.handler(event, context);

      const response = responseContainer.response;
      assert(response.shouldEndSession);

      const outputSpeech = response.outputSpeech;
      expect(outputSpeech.ssml).to.equal(
        `<speak>I found this positively rated restroom at <say-as interpret-as="digits">${zipcode}</say-as>. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email.</speak>`
      );
      expect(outputSpeech.type).to.equal("SSML");

      const card = response.card;
      expect(card.title).to.equal(`Here are some restrooms at ${zipcode}`);
      expect(card.type).to.equal("Simple");
      expect(card.content).to.equal(buildSimpleCardContent(clonedDummyRestRooms));

      expect(response.directives.length).is.equal(1);
      const directive = response.directives[0];
      verifyAPLDirectiveStructure(directive);
      expect(directive.document).to.eql(restroomDetailsDocument);
      const actualDatasource = directive.datasources;
      expect(actualDatasource).to.eql(
        restroomDetailsDatasource(
          `Here is a restroom at ${zipcode}.`,
          `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
          `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.RATINGS} ${positiveRatingPercentage}% positive`,
          `I also sent this and other restrooms I found to your email. I also included Google Maps™ navigation links in the email.`,
        )
      );

      const sentMail = nodemailerMock.mock.getSentMail();
      const htmlBody = sentMail[0].html;
      expect(htmlBody.includes(`${icons.RATINGS} ${positiveRatingPercentage}% positive`)).to.be.true;
    }
  });

  it("should not call out rating in  prompts if we find a not so highly rated restroom when searching for restrooms by location. We should still show the rating in visual results.", async () => {
    const event = importFresh("../test-data/atlocation");

    const restroomDelivered = clonedDummyRestRooms[0];
    const highlyRatedRestRoomVoteCombinations = [[69, 30], [30, 30], [0, 0], [0, 1000]];
    for (const combination of highlyRatedRestRoomVoteCombinations) {
      restroomDelivered.upvote = combination[0];
      restroomDelivered.downvote = combination[1];
      const positiveRatingPercentage = determinePositiveRatingPercentage(restroomDelivered);

      const zipcode = event.session.attributes.zipcode;
      const coordinates = zipcodes.getCoordinates(zipcode);
      configureRRService(200, coordinates.latitude, coordinates.longitude, false, false, clonedDummyRestRooms);

      configureUpsService(200, event.context, DUMMY_EMAIL_ADDRESS);

      const responseContainer = await unitUnderTest.handler(event, context);

      const response = responseContainer.response;
      assert(response.shouldEndSession);

      const outputSpeech = response.outputSpeech;
      expect(outputSpeech.ssml).to.equal(
        `<speak>I found this restroom at <say-as interpret-as="digits">${zipcode}</say-as>. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email.</speak>`
      );
      expect(outputSpeech.type).to.equal("SSML");

      const card = response.card;
      expect(card.title).to.equal(`Here are some restrooms at ${zipcode}`);
      expect(card.type).to.equal("Simple");
      expect(card.content).to.equal(buildSimpleCardContent(clonedDummyRestRooms));

      expect(response.directives.length).is.equal(1);
      const directive = response.directives[0];
      verifyAPLDirectiveStructure(directive);
      expect(directive.document).to.eql(restroomDetailsDocument);
      const actualDatasource = directive.datasources;
      expect(actualDatasource).to.eql(
        restroomDetailsDatasource(
          `Here is a restroom at ${zipcode}.`,
          `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
          `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.RATINGS} ${Number.isInteger(positiveRatingPercentage) ? `${positiveRatingPercentage}% positive` : `Not Rated`}`,
          `I also sent this and other restrooms I found to your email. I also included Google Maps™ navigation links in the email.`,
        )
      );

      const sentMail = nodemailerMock.mock.getSentMail();
      const htmlBody = sentMail[0].html;
      expect(htmlBody.includes(`${icons.RATINGS} ${Number.isInteger(positiveRatingPercentage) ? `${positiveRatingPercentage}% positive` : `Not Rated`}`)).to.be.true;

      nodemailerMock.mock.reset();
    }
  });

  it("should not call out rating in  prompts if we find an unrated restroom when searching for restrooms by location. We should still show that the restroom is unreated in visual results.", async () => {
    const event = importFresh("../test-data/atlocation");

    const restroomDelivered = clonedDummyRestRooms[0];
    restroomDelivered.upvote = 0;
    restroomDelivered.downvote = 0;

    const zipcode = event.session.attributes.zipcode;
    const coordinates = zipcodes.getCoordinates(zipcode);
    configureRRService(200, coordinates.latitude, coordinates.longitude, false, false, clonedDummyRestRooms);

    configureUpsService(200, event.context, DUMMY_EMAIL_ADDRESS);

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    assert(response.shouldEndSession);

    const outputSpeech = response.outputSpeech;
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this restroom at <say-as interpret-as="digits">${zipcode}</say-as>. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    const card = response.card;
    expect(card.title).to.equal(`Here are some restrooms at ${zipcode}`);
    expect(card.type).to.equal("Simple");
    expect(card.content).to.equal(buildSimpleCardContent(clonedDummyRestRooms));

    expect(response.directives.length).is.equal(1);
    const directive = response.directives[0];
    verifyAPLDirectiveStructure(directive);
    expect(directive.document).to.eql(restroomDetailsDocument);
    const actualDatasource = directive.datasources;
    expect(actualDatasource).to.eql(
      restroomDetailsDatasource(
        `Here is a restroom at ${zipcode}.`,
        `${restroomDelivered.name}<br>${restroomDelivered.street}, ${restroomDelivered.city}, ${restroomDelivered.state}`,
        `${icons.GREEN_CHECKMARK} Gender Neutral<br>${icons.GREEN_CHECKMARK} Accessible<br>${icons.RED_CROSSMARK} Changing Table<br>${icons.RATINGS} Not Rated`,
        `I also sent this and other restrooms I found to your email. I also included Google Maps™ navigation links in the email.`,
      )
    );

    const sentMail = nodemailerMock.mock.getSentMail();
    const htmlBody = sentMail[0].html;
    expect(htmlBody.includes(`${icons.RATINGS} Not Rated`)).to.be.true;
  });
});

describe("Punching out to Maps navigation", function () {
  const DUMMY_EMAIL_ADDRESS = "success@simulator.amazonses.com";

  const DUMMY_LATITUDE = 47.62078857421875;
  const DUMMY_LONGITUDE = -122.30061853955556;

  const dummyRestRooms = importFresh("../test-data/sample-RR-response.json");

  before(async () => {
  });

  let clonedDummyRestRooms;
  beforeEach(async () => {
    clonedDummyRestRooms = cloneDeep(dummyRestRooms);
  });

  it("should punch out to Apple Maps directions for the top search result in the happy path on iOS devices.", async () => {
    const event = importFresh("../test-data/yes_ios");
    const latitude = event.session.attributes.latitude;
    const longitude = event.session.attributes.longitude;

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    expect(response.shouldEndSession).to.be.undefined;

    expect(response.directives.length).to.eql(1);
    expect(response.directives[0]).to.eql(iOSMapsAppLinkDirective(`https://maps.apple.com/?daddr=${latitude},${longitude}`, 'Okay.', 'Please unlock your device to see the directions.'));
  });

  it("should punch out to Google Maps directions for the top search result in the happy path on Android devices.", async () => {
    const event = importFresh("../test-data/yes_android");
    const latitude = event.session.attributes.latitude;
    const longitude = event.session.attributes.longitude;

    const responseContainer = await unitUnderTest.handler(event, context);

    const response = responseContainer.response;
    expect(response.shouldEndSession).to.be.undefined;

    expect(response.directives.length).to.eql(1);
    expect(response.directives[0]).to.eql(androidMapsAppLinkDirective(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`, 'Okay.', 'Please unlock your device to see the directions.'));
  });

  it.skip("should offer to punch out to Apple Maps directions on iOS devices that support AppLinks.", async () => {
    const event = importFresh("../test-data/nearme_geo_supported_ios_applinks_supported");
    event.context.Geolocation.coordinate.latitudeInDegrees = DUMMY_LATITUDE;
    event.context.Geolocation.coordinate.longitudeInDegrees = DUMMY_LONGITUDE;

    configureUpsService(200, event.context, DUMMY_EMAIL_ADDRESS);
    configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false, clonedDummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);
    const response = responseContainer.response;

    expect(response.shouldEndSession).to.be.false;

    const sessionAttributes = responseContainer.sessionAttributes;
    expect(sessionAttributes.state).to.eql(states.OFFER_DIRECTIONS);
    expect(sessionAttributes.latitude).to.eql(DUMMY_LATITUDE);
    expect(sessionAttributes.longitude).to.eql(DUMMY_LONGITUDE);

    const restroomDelivered = clonedDummyRestRooms[0];
    console.log(JSON.stringify(restroomDelivered))
    const outputSpeech = response.outputSpeech;
    const distance = roundDownDistance(restroomDelivered.distance);
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this positively rated restroom ${distance} miles away. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email. Shall I load a map with directions to this restroom?</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    expect(response.directives.length).to.eql(1);
    verifyAPLDirectiveStructure(response.directives[0]);
  });

  it.skip("should offer to punch out to Google Maps directions on Android devices that support AppLinks.", async () => {
    const event = importFresh("../test-data/nearme_geo_supported_android_applinks_supported");
    event.context.Geolocation.coordinate.latitudeInDegrees = DUMMY_LATITUDE;
    event.context.Geolocation.coordinate.longitudeInDegrees = DUMMY_LONGITUDE;

    configureUpsService(200, event.context, DUMMY_EMAIL_ADDRESS);
    configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false, clonedDummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);
    const response = responseContainer.response;

    expect(response.shouldEndSession).to.be.false;

    const sessionAttributes = responseContainer.sessionAttributes;
    expect(sessionAttributes.state).to.eql(states.OFFER_DIRECTIONS);
    expect(sessionAttributes.latitude).to.eql(DUMMY_LATITUDE);
    expect(sessionAttributes.longitude).to.eql(DUMMY_LONGITUDE);

    const restroomDelivered = clonedDummyRestRooms[0];
    console.log(JSON.stringify(restroomDelivered))
    const outputSpeech = response.outputSpeech;
    const distance = roundDownDistance(restroomDelivered.distance);
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this positively rated restroom ${distance} miles away. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email. Shall I load a map with directions to this restroom?</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    expect(response.directives.length).to.eql(1);
    verifyAPLDirectiveStructure(response.directives[0]);
  });

  it("should not offer to punch out to Maps directions if the device does not support AppLinks.", async () => {
    const event = importFresh("../test-data/nearme_geo_supported_applinks_not_supported");
    event.context.Geolocation.coordinate.latitudeInDegrees = DUMMY_LATITUDE;
    event.context.Geolocation.coordinate.longitudeInDegrees = DUMMY_LONGITUDE;

    configureUpsService(200, event.context, DUMMY_EMAIL_ADDRESS);
    configureRRService(200, DUMMY_LATITUDE, DUMMY_LONGITUDE, false, false, clonedDummyRestRooms);

    const responseContainer = await unitUnderTest.handler(event, context);
    const response = responseContainer.response;

    assert(response.shouldEndSession);
    const restroomDelivered = clonedDummyRestRooms[0];
    console.log(JSON.stringify(restroomDelivered))
    const outputSpeech = response.outputSpeech;
    const distance = roundDownDistance(restroomDelivered.distance);
    expect(outputSpeech.ssml).to.equal(
      `<speak>I found this positively rated restroom ${distance} miles away. ${describeRestroom(restroomDelivered)}. I also sent this and more restrooms to your email.</speak>`
    );
    expect(outputSpeech.type).to.equal("SSML");

    expect(response.directives.length).to.eql(1);
    verifyAPLDirectiveStructure(response.directives[0]);
  });
});

function androidMapsAppLinkDirective(link, unlockedScreenSpeech, lockedScreenSpeech) {
  return {
    type: "Connections.StartConnection",
    uri: "connection://AMAZON.LinkApp/1",
    input: {
      catalogInfo: {
        identifier: android.GOOGLE_MAPS_IDENTIFIER,
        type: android.STORE_TYPE,
      },
      actions: {
        primary: {
          type: "UNIVERSAL_LINK",
          link: link
        }
      },
      prompts: {
        onAppLinked: {
          prompt: {
            ssml: `<speak>${unlockedScreenSpeech}</speak>`,
            type: "SSML"
          },
          defaultPromptBehavior: "SPEAK"
        },
        onScreenLocked: {
          prompt: {
            ssml: `<speak>${lockedScreenSpeech}</speak>`,
            type: "SSML"
          }
        }
      }
    }
  }
}

function iOSMapsAppLinkDirective(link, unlockedScreenSpeech, lockedScreenSpeech) {
  return {
    type: "Connections.StartConnection",
    uri: "connection://AMAZON.LinkApp/1",
    input: {
      catalogInfo: {
        identifier: ios.APPLE_MAPS_IDENTIFIER,
        type: ios.STORE_TYPE,
      },
      actions: {
        primary: {
          type: "UNIVERSAL_LINK",
          link: link
        }
      },
      prompts: {
        onAppLinked: {
          prompt: {
            ssml: `<speak>${unlockedScreenSpeech}</speak>`,
            type: "SSML"
          },
          defaultPromptBehavior: "SPEAK"
        },
        onScreenLocked: {
          prompt: {
            ssml: `<speak>${lockedScreenSpeech}</speak>`,
            type: "SSML"
          }
        }
      }
    }
  }
}

function roundDownDistance(distance) {
  return Math.round((distance + Number.EPSILON) * 100) / 100
}

function buildSimpleCardContent(restrooms) {
  let content = ``;

  restrooms.slice(0, 4).forEach(restroom => {
    const positiveRatingPercentage = determinePositiveRatingPercentage(restroom);

    content += `
${visuallyDescribeRestroom(restroom)}
Rating: ${Number.isInteger(positiveRatingPercentage) ? `${positiveRatingPercentage}% positive` : `Not Rated`}
Directions: ${restroom.directions ? `${restroom.directions}` : `Not Available`}
Unisex: ${restroom.unisex ? 'Yes' : 'No'}, Accessible: ${restroom.accessible ? 'Yes' : 'No'}, Changing Table: ${restroom.changing_table ? 'Yes' : 'No'}
`});

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

function configureGoogleMapsService(responseCode, address, payload) {
  if (!nock.isActive()) {
    nock.activate();
  }

  nock(GoogleMaps.BASE_URL)
    .get(`/api/geocode/json?address=${address}&components=country:US&key=${DUMMY_GOOGLE_MAPS_API_KEY}`)
    .reply(responseCode, JSON.stringify(payload, null, 2));
}

function configureGoogleMapsServiceWithBounds(responseCode, address, latitude, longitude, payload) {
  if (!nock.isActive()) {
    nock.activate();
  }

  nock(GoogleMaps.BASE_URL)
    .get(`/api/geocode/json?address=${address}&bounds=${latitude},${longitude}|${latitude},${longitude}&components=country:US&key=${DUMMY_GOOGLE_MAPS_API_KEY}`)
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
 * Verify the structure of the APL directives.
 */
function verifyAPLDirectiveStructure(directive) {
  expect(directive).is.not.null;

  expect(directive.type).to.equal(APL_DOCUMENT_TYPE);
  expect(directive.version).to.equal(APL_DOCUMENT_VERSION);
}
