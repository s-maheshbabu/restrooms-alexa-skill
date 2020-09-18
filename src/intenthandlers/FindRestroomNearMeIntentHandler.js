const EmailValidator = require("email-validator");
const utilities = require("../utilities");

const RR = require("gateway/RefugeeRestrooms");
const Mailer = require("gateway/Mailer.js");
const zipcodes = require("gateway/Zipcodes");

const IntentHelper = require("./FindRestroomIntentHelper");

const messages = require("constants/Messages").messages;
const scopes = require("constants/Scopes").scopes;

module.exports = FindRestroomNearMeIntentHandler = {
  canHandle(handlerInput) {
    return utilities.isIntent(handlerInput, 'FindRestroomNearMeIntent');
  },
  async handle(handlerInput) {
    const { requestEnvelope } = handlerInput;

    const isGeoSupported = requestEnvelope.context.System.device.supportedInterfaces.Geolocation;
    if (isGeoSupported) {
      return await findRestroomsNearUserGeoLocation(handlerInput);
    } else {
      return await findRestroomsNearDeviceAddress(handlerInput);
    }
  }
}

/**
 * Documentation.
 */
async function findRestroomsNearDeviceAddress(handlerInput) {
  const { requestEnvelope, serviceClientFactory, responseBuilder } = handlerInput;

  const { deviceId } = requestEnvelope.context.System.device;
  const deviceAddressServiceClient = serviceClientFactory.getDeviceAddressServiceClient();

  let address;
  try {
    address = await deviceAddressServiceClient.getCountryAndPostalCode(deviceId);
  } catch (error) {
    console.log(error)
    if (error.statusCode === 403) {
      return responseBuilder
        .speak(messages.NOTIFY_MISSING_DEVICE_ADDRESS_PERMISSIONS)
        .withAskForPermissionsConsentCard([scopes.ADDRESS_SCOPE])
        .withShouldEndSession(true)
        .getResponse();
    }
    throw error;
  }

  if (address.countryCode !== "US") {
    return responseBuilder
      .speak(`Sorry. I currently only support locations within the United States.`)
      .withShouldEndSession(true)
      .getResponse();
  }
  if (address.postalCode == null) {
    return responseBuilder
      .speak(`Sorry. I was unable to determine your device location with sufficient granualarity. Please try again later.`)
      .withShouldEndSession(true)
      .getResponse();
  }

  console.log(`A valid device address was retrieved: ${address}`);
  const coordinates = zipcodes.getCoordinates(address.postalCode);
  if (!coordinates) {
    return responseBuilder
      .speak(`Sorry. ${address.postalCode} is not a valid postal code in the US. Please try again later.`)
      .withShouldEndSession(true)
      .getResponse();
  }

  const latitude = coordinates.latitude;
  const longitude = coordinates.longitude;
  console.log(`Zipcode ${address.postalCode} was converted to geo location: ${latitude}, ${longitude}`);

  const restrooms = await search(handlerInput, latitude, longitude);
  return await buildResponse(handlerInput, restrooms);
}

async function findRestroomsNearUserGeoLocation(handlerInput) {
  const { context } = handlerInput.requestEnvelope;
  const { responseBuilder } = handlerInput;

  const geoObject = context.Geolocation;

  const hasPermissions = context.System.user.permissions.scopes[scopes.GEO_LOCATION_SCOPE].status === "GRANTED";
  if (!hasPermissions) {
    return responseBuilder
      .speak(messages.NOTIFY_MISSING_GEO_LOCATION_PERMISSIONS)
      .withShouldEndSession(true)
      .withAskForPermissionsConsentCard([scopes.GEO_LOCATION_SCOPE])
      .getResponse();
  }
  else if (geoObject && geoObject.locationServices.access !== 'ENABLED') {
    return responseBuilder
      .speak(`Please make sure device location tracking is enabled in your device, and try again later.`)
      .getResponse();
  }
  else if (!geoObject || !geoObject.coordinate) {
    return responseBuilder
      .speak(`Refugee Restrooms is having trouble accessing your location. Please make sure device location tracking is enabled in your device, and try again later.`)
      .getResponse();
  }

  const latitude = geoObject.coordinate.latitudeInDegrees;
  const longitude = geoObject.coordinate.longitudeInDegrees;
  console.log(`A valid user geo location was retrieved: ${latitude}, ${longitude}`);

  const restrooms = await search(handlerInput, latitude, longitude);
  return await buildResponse(handlerInput, restrooms);
}

async function search(handlerInput, latitude, longitude) {
  const filters = IntentHelper.getSearchFilters(handlerInput);
  return await RR.searchRestroomsByLatLon(latitude, longitude, filters.isFilterByADA, filters.isFilterByUnisex, filters.isFilterByChangingTable);
}

async function buildResponse(handlerInput, restrooms) {
  const { responseBuilder } = handlerInput;

  if (!Array.isArray(restrooms) || !restrooms.length) {
    return responseBuilder
      .speak(`I'm sorry. I couldn't find any restrooms near you.`)
      .withShouldEndSession(true)
      .getResponse();
  }

  const emailAddress = await IntentHelper.getEmailAddress(handlerInput);
  if (emailAddress) {
    // Is it possible to not wait for the email to be sent?
    console.log("A valid email address was obtained. Sending the search results over email. " + `Temporary logging: ${emailAddress}`);
    await Mailer.sendEmail(emailAddress, undefined, restrooms);
  }

  // TODO: We can't always say 'this and more results'. What if there was only one result?
  const builder = responseBuilder
    .speak(`I found this restroom near you. ${IntentHelper.describeRestroom(restrooms[0])}.${emailAddress ? ` I also sent this and more restrooms to your email.` : ` ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}`}`)
    .addDirective(IntentHelper.buildAPLDirective(undefined, restrooms[0]))
    .withShouldEndSession(true);

  if (!emailAddress) builder.withAskForPermissionsConsentCard([scopes.EMAIL_SCOPE]);
  else builder.withSimpleCard(...IntentHelper.buildSimpleCard(undefined, restrooms));

  return builder.getResponse();
}