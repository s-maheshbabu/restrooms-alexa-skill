const EmailValidator = require("email-validator");

const RR = require("gateway/RefugeeRestrooms");
const Mailer = require("gateway/Mailer.js");
const zipcodes = require("gateway/Zipcodes");

const messages = require("constants/Messages").messages;
const scopes = require("constants/Scopes").scopes;
const searchfilters = require("constants/SearchFilters").searchfilters;

const APL_CONSTANTS = require("constants/APL");
const APL_DOCUMENT_TYPE = APL_CONSTANTS.APL_DOCUMENT_TYPE;
const APL_DOCUMENT_VERSION = APL_CONSTANTS.APL_DOCUMENT_VERSION;
const restroomDetailsDocument = require("apl/document/RestroomDetailsDocument.json");
const restroomDetailsDatasource = require("apl/data/RestroomDetailsDatasource");

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

  const emailAddress = await getEmailAddress(handlerInput);
  if (emailAddress) {
    // Is it possible to not wait on sending the email?
    Mailer.sendEmail(emailAddress, "near you", restrooms);
    console.log("We have the user's email address. An email was sent with the search results.");
  }

  return responseBuilder
    .speak(`I found this restroom near you. ${describeRestroom(restrooms[0])}. I also sent the details to your email.`)
    .withSimpleCard(...buildSimpleCard(restrooms))
    .addDirective(buildAPLDirective(restrooms[0]))
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
      .speak(`Please make sure device location tracking is enabled in your device, and try again later.`)
      .getResponse();
  }
  else if (!geoObject || !geoObject.coordinate) {
    return responseBuilder
      .speak(`Refugee Restrooms is having trouble accessing your location. Please wait a moment, and try again later.`)
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

  const emailAddress = await getEmailAddress(handlerInput);
  if (emailAddress) {
    console.log("A valid email address was obtained. Sending the search results over email. " + `Temporary logging: ${emailAddress}`);
    await Mailer.sendEmail(emailAddress, "near you", restrooms);
  }

  return responseBuilder
    .speak(`I found this restroom close to your location. ${describeRestroom(restrooms[0])}. I also sent the details to your email.`)
    .withSimpleCard(...buildSimpleCard(restrooms))
    .addDirective(buildAPLDirective(restrooms[0]))
    .withShouldEndSession(true)
    .getResponse();
}

async function getEmailAddress(handlerInput) {
  const { requestEnvelope, serviceClientFactory } = handlerInput;

  let emailAddress = null;
  const consentToken = requestEnvelope.context.System.apiAccessToken;
  if (!consentToken) {
    // Eventually, we might want to render an error prompt and push a card to the user asking them to grant permissions.
    // However, that makes sense only after we make sending email an explicit user approved step.
    // Right now, we send the email by default and so just swallowing the error and moving on.
    console.log(`Missing permissions to access user email.`);
    return emailAddress;
  }

  try {
    const client = serviceClientFactory.getUpsServiceClient();
    emailAddress = await client.getProfileEmail();
  } catch (error) {
    console.log(`Unexpected error while trying to fetch user profile: ${error}`);
  }

  if (!EmailValidator.validate(emailAddress)) return null;
  return emailAddress;
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

function buildSimpleCard(restrooms) {
  let content = ``;

  restrooms.slice(0, 4).forEach(restroom => content += `
${visuallyDescribeRestroom(restroom)}
Directions: ${restroom.directions ? `${restroom.directions}` : `Not Available`}
Unisex: ${restroom.unisex ? 'Yes' : 'No'}, Accessible: ${restroom.accessible ? 'Yes' : 'No'}, Changing Table: ${restroom.changing_table ? 'Yes' : 'No'}
`);

  return [
    `Here are some restrooms near you`,
    content
  ]
}

function buildAPLDirective(restroom) {
  return {
    type: APL_DOCUMENT_TYPE,
    version: APL_DOCUMENT_VERSION,
    document: restroomDetailsDocument,
    datasources: restroomDetailsDatasource(
      `Here is a restroom near you.`,
      `${restroom.name}\<br\>${restroom.street}, ${restroom.city}, ${restroom.state}`,
      `Gender Neutral: ${restroom.unisex ? '&\#9989;' : '&\#10060;'}\<br\>Accessible: ${restroom.accessible ? '&\#9989;' : '&\#10060;'}\<br\>Changing Table: ${restroom.changing_table ? '&\#9989;' : '&\#10060;'}`
    )
  }
}