const utilities = require("../utilities");

const RR = require("gateway/RefugeeRestrooms");
const Mailer = require("gateway/Mailer.js");
const GoogleMaps = require("gateway/GoogleMaps");
const zipcodes = require("gateway/Zipcodes");

const messages = require("constants/Messages").messages;
const scopes = require("constants/Scopes").scopes;

const IntentHelper = require("./FindRestroomIntentHelper");
const InvalidAddressError = require("../errors/InvalidAddressError");
const UnparseableError = require('../errors/UnparseableError');
const isPositivelyRated = require("./FindRestroomIntentHelper").isPositivelyRated;

module.exports = FindRestroomAtAddressIntentHandler = {
  canHandle(handlerInput) {
    return utilities.isIntent(handlerInput, 'FindRestroomAtAddressIntent');
  },
  async handle(handlerInput) {
    const { responseBuilder } = handlerInput;

    let address;
    try {
      address = getAddress(handlerInput);
    } catch (error) {
      if (error instanceof UnparseableError)
        return responseBuilder
          .speak(`I am sorry but I currently do not support addresses with numbered streets like twenty fourth avenue, eigth street etc. Good bye.`)
          .withShouldEndSession(true)
          .getResponse();
    }

    let boundingCoordinates = {};
    if (isStreetOnly(handlerInput)) {
      boundingCoordinates = await getBoundingCoordinates(handlerInput);
      console.log(`Bounding coordinates for address to geocode lookup: ${JSON.stringify(boundingCoordinates)}`);
    }

    let coordinates;
    try {
      coordinates = await GoogleMaps.getCoordinates(address, boundingCoordinates.latitude, boundingCoordinates.longitude);
    } catch (error) {
      if (error instanceof InvalidAddressError) {
        console.log(error);
      }
      // Bubble up any other error to render a generic error message.
      else throw error;
    }
    if (!coordinates) {
      return responseBuilder
        .speak(`Sorry. Given address is not a valid address in the US. Please try again with a valid US based address.`)
        .withShouldEndSession(true)
        .getResponse();
    }

    const filters = IntentHelper.getSearchFilters(handlerInput);
    const restrooms = await RR.searchRestroomsByLatLon(coordinates.latitude, coordinates.longitude, filters.isFilterByADA, filters.isFilterByUnisex, filters.isFilterByChangingTable);

    if (!Array.isArray(restrooms) || !restrooms.length) {
      return responseBuilder
        .speak(`I'm sorry. I couldn't find any restrooms at given address matching your criteria.`)
        .withShouldEndSession(true)
        .getResponse();
    }

    const emailAddress = await IntentHelper.getEmailAddress(handlerInput);
    if (emailAddress) {
      // Is it possible to not wait on sending the email?
      await Mailer.sendEmail(emailAddress, 'given address', restrooms);
      console.log("We have the user's email address. An email was sent with the search results.");
    }

    // TODO: We can't always say 'this and more results'. What if there was only one result?
    const builder = responseBuilder
      .speak(`I found this ${isPositivelyRated(restrooms[0]) ? `positively rated ` : ``}restroom at given address. ${IntentHelper.describeRestroom(restrooms[0])}.${emailAddress ? ` I also sent this and more restrooms to your email.` : ` ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}`}`)
      .addDirective(IntentHelper.buildAPLDirective('given address', restrooms[0], !emailAddress))
      .withShouldEndSession(true);

    if (!emailAddress) builder.withAskForPermissionsConsentCard([scopes.EMAIL_SCOPE]);
    else builder.withSimpleCard(...IntentHelper.buildSimpleCard('given address', restrooms));

    return builder.getResponse();
  }
}

/**
 * TODO: This whole thing is a copy paste from FindRestroomNearMeIntentHandler. Refactor.
 * Fetch the bounding coordinates to be used while converting an address to geocodes. 
 * 
 * If the device is mobile and location permissions granted, we fetch the device coordinates.
 * If the device is static and device address permissions granted, we fetch the device postal
 * code and use that the fetch approximate device coordinates.
 * In every other case, we return an empty coordinates object. 
 */
async function getBoundingCoordinates(handlerInput) {
  const { requestEnvelope, serviceClientFactory } = handlerInput;
  const { context } = handlerInput.requestEnvelope;

  const coordinates = {};

  const isGeoSupported = requestEnvelope.context.System.device.supportedInterfaces.Geolocation;
  if (isGeoSupported) {
    const hasPermissions = context.System.user.permissions.scopes[scopes.GEO_LOCATION_SCOPE].status === "GRANTED";
    if (hasPermissions) {
      const geoObject = context.Geolocation;
      if (geoObject && geoObject.coordinate) {
        coordinates.latitude = geoObject.coordinate.latitudeInDegrees;
        coordinates.longitude = geoObject.coordinate.longitudeInDegrees;
      }
    }
  } else {
    const { deviceId } = requestEnvelope.context.System.device;
    const deviceAddressServiceClient = serviceClientFactory.getDeviceAddressServiceClient();

    let address;
    try {
      address = await deviceAddressServiceClient.getCountryAndPostalCode(deviceId);
    } catch (error) {
      console.log(`Unable to fetch device address to place bounds of address based restroom search. Swallowing the error: ${error}`);
      return coordinates;
    }

    if (address.postalCode != null) {
      const temporaryCoordinates = zipcodes.getCoordinates(address.postalCode);
      coordinates.latitude = temporaryCoordinates.latitude;
      coordinates.longitude = temporaryCoordinates.longitude;
    }
  }

  return coordinates;
}

/**
 * Construct address from the street, city and state fields
 * in the session attributes.
 */
function getAddress(handlerInput) {
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
  const street = utilities.sanitizeAddress(sessionAttributes.street);
  const city = sessionAttributes.city || '';
  const state = sessionAttributes.state || '';

  const address = `${street}${city ? ` ${city}` : ''}${state ? ` ${state}` : ''}`;
  // TODO: Test this.
  if (!address) throw new Error("Address was empty. Address should include at least the street name.");
  return address;
}

/**
 * Returns true is only street address is present. Otherwise returns false.
 * @param {*} handlerInput 
 */
function isStreetOnly(handlerInput) {
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

  return sessionAttributes.street && !sessionAttributes.city && !sessionAttributes.state;
}
