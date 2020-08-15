const RR = require("gateway/RefugeeRestrooms");
const zipcodes = require("gateway/Zipcodes");

const messages = require("constants/Messages").messages;
const scopes = require("constants/Scopes").scopes;

module.exports = FindRestroomNearMeIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === "IntentRequest" &&
      (handlerInput.requestEnvelope.request.intent.name === "FindRestroomNearMeIntent")
    );
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

  const consentToken = requestEnvelope.context.System.apiAccessToken;
  if (!consentToken) {
    return responseBuilder
      .speak(messages.NOTIFY_MISSING_PERMISSIONS)
      .withAskForPermissionsConsentCard([scopes.ADDRESS_SCOPE])
      .getResponse();
  }

  const { deviceId } = requestEnvelope.context.System.device;
  const deviceAddressServiceClient = serviceClientFactory.getDeviceAddressServiceClient();

  let address;
  try {
    address = await deviceAddressServiceClient.getCountryAndPostalCode(deviceId);
  } catch (error) {
    // This needs to be tested.
    if (error.name !== 'ServiceError') {
      const response = responseBuilder.speak(messages.ERROR).getResponse();
      return response;
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

  const restrooms = await RR.searchRestroomsByLatLon(coordinates.latitude, coordinates.longitude);
  return responseBuilder
    .speak(`Placeholder response ${restrooms[0].name} ${address.postalCode}`)
    .withShouldEndSession(true)
    .getResponse();
}

async function findRestroomsNearUserGeoLocation(handlerInput) {
  const { context } = handlerInput.requestEnvelope;
  const { responseBuilder } = handlerInput;

  const geoObject = context.Geolocation;

  const hasPermissions = context.System.user.permissions.scopes[scopes.GEO_LOCATION_SCOPE].status === "GRANTED";
  if (!hasPermissions) {
    return responseBuilder
      .speak(messages.NOTIFY_MISSING_GEO_LOCATION_PERMISSIONS)
      .withAskForPermissionsConsentCard([scopes.GEO_LOCATION_SCOPE])
      .getResponse();
  }
  else if (geoObject && geoObject.locationServices.access !== 'ENABLED') {
    return responseBuilder
      .speak(`Please make sure device location tracking is enabled in your device.`)
      .getResponse();
  }
  else if (!geoObject || !geoObject.coordinate) {
    return responseBuilder
      .speak(`Location Demo is having trouble accessing your location. Please wait a moment, and try again later.`)
      .getResponse();
  }

  const latitude = geoObject.coordinate.latitudeInDegrees;
  const longitude = geoObject.coordinate.longitudeInDegrees;

  console.log(`A valid user geo location was retrieved: ${latitude}, ${longitude}`);
  const restrooms = await RR.searchRestroomsByLatLon(latitude, longitude);
  return responseBuilder
    .speak(`Placeholder response geo location ${restrooms[0].name}`)
    .withShouldEndSession(true)
    .getResponse();
}