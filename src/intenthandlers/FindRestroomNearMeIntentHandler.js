const RR = require("gateway/RefugeeRestrooms");
const zipcodes = require("gateway/Zipcodes");

const messages = require("constants/Messages").messages;
const scopes = require("constants/Scopes").scopes;
const searchfilters = require("constants/SearchFilters").searchfilters;

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

  const filters = getSearchFilters(handlerInput);
  const restrooms = await RR.searchRestroomsByLatLon(coordinates.latitude, coordinates.longitude, filters.isFilterByADA, filters.isFilterByUnisex, filters.isFilterByChangingTable);

  if (!Array.isArray(restrooms) || !restrooms.length) {
    return responseBuilder
      .speak(`I'm sorry. I couldn't find any restrooms near you.`)
      .withShouldEndSession(true)
      .getResponse();
  }

  return responseBuilder
    .speak(`I found this restroom near you. ${describeRestroom(restrooms[0])}`)
    .withSimpleCard(
      `Restroom details`,
      `${visuallyDescribeRestroom(restrooms[0])}
Directions: ${restrooms[0].directions}
Accessible: ${restrooms[0].accessible}
Unisex: ${restrooms[0].unisex}
Has Changing Table: ${restrooms[0].changing_table}`
    )
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
      .withShouldEndSession(true)
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
  const filters = getSearchFilters(handlerInput);
  const restrooms = await RR.searchRestroomsByLatLon(latitude, longitude, filters.isFilterByADA, filters.isFilterByUnisex, filters.isFilterByChangingTable);

  if (!Array.isArray(restrooms) || !restrooms.length) {
    return responseBuilder
      .speak(`I'm sorry. I couldn't find any restrooms close to your location.`)
      .withShouldEndSession(true)
      .getResponse();
  }

  return responseBuilder
    .speak(`I found this restroom close to your location. ${describeRestroom(restrooms[0])}`)
    .withSimpleCard(
      `Restroom details`,
      `${visuallyDescribeRestroom(restrooms[0])}
Directions: ${restrooms[0].directions}
Accessible: ${restrooms[0].accessible}
Unisex: ${restrooms[0].unisex}
Has Changing Table: ${restrooms[0].changing_table}`
    )
    .withShouldEndSession(true)
    .getResponse();
}

/**
 * Converts the search filters in the user's request to boolean search filters that
 * can be used in the queries to refugee restrooms gateway.
 */
function getSearchFilters(handlerInput) {
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
  const search_filters = sessionAttributes.search_filters || [];

  let isFilterByADA = false, isFilterByUnisex = false, isFilterByChangingTable = false;
  if (search_filters.includes(searchfilters.ACCESSIBLE)) isFilterByADA = true;
  if (search_filters.includes(searchfilters.UNISEX)) isFilterByUnisex = true;
  if (search_filters.includes(searchfilters.CHANGING_TABLE)) isFilterByChangingTable = true;

  return {
    isFilterByADA: isFilterByADA,
    isFilterByUnisex: isFilterByUnisex,
    isFilterByChangingTable: isFilterByChangingTable,
  };
}

/**
 * An SSML description of the given restroom.
 */
function describeRestroom(restroom) {
  return `<s>${restroom.name}</s> <say-as interpret-as="address"> ${restroom.street} </say-as>, ${restroom.city}`;
}

/**
 * An SSML description of the given restroom.
 */
function visuallyDescribeRestroom(restroom) {
  return `${restroom.name}, ${restroom.street}, ${restroom.city}, ${restroom.state}`;
}