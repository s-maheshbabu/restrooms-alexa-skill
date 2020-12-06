const utilities = require("../utilities");

const RR = require("gateway/RefugeeRestrooms");
const Mailer = require("gateway/Mailer.js");
const zipcodes = require("gateway/Zipcodes");

const messages = require("constants/Messages").messages;
const scopes = require("constants/Scopes").scopes;
const states = require("constants/Constants").states;

const IntentHelper = require("./FindRestroomIntentHelper");
const isPositivelyRated = require("./FindRestroomIntentHelper").isPositivelyRated;

module.exports = FindRestroomAtLocationIntentHandler = {
  canHandle(handlerInput) {
    return utilities.isIntent(handlerInput, 'FindRestroomAtLocationIntent');
  },
  async handle(handlerInput) {
    const { attributesManager, responseBuilder } = handlerInput;

    const zipcode = getZipcode(handlerInput);
    // If zipcode is missing or invalid, render error messages.
    console.log(`Searching for restrooms in zipcode: ${zipcode}`);
    const coordinates = zipcodes.getCoordinates(zipcode);
    if (!coordinates) {
      return responseBuilder
        .speak(`Sorry. <say-as interpret-as="digits">${zipcode}</say-as> is not a valid US zip code. Please try later with a valid zip code. Good bye.`)
        .withShouldEndSession(true)
        .getResponse();
    }

    const filters = IntentHelper.getSearchFilters(handlerInput);
    const restrooms = await RR.searchRestroomsByLatLon(coordinates.latitude, coordinates.longitude, filters.isFilterByADA, filters.isFilterByUnisex, filters.isFilterByChangingTable);

    if (!Array.isArray(restrooms) || !restrooms.length) {
      return responseBuilder
        .speak(`I'm sorry. I couldn't find any restrooms at <say-as interpret-as="digits">${zipcode}</say-as> matching your criteria.`)
        .withShouldEndSession(true)
        .getResponse();
    }

    const emailAddress = await IntentHelper.getEmailAddress(handlerInput);
    if (emailAddress) {
      // Is it possible to not wait on sending the email?
      await Mailer.sendEmail(emailAddress, zipcode, restrooms);
      console.log("We have the user's email address. An email was sent with the search results.");
    }

    const offerDirections = utilities.isAppLinksSupported(handlerInput);
    if (offerDirections && Array.isArray(restrooms) && restrooms.length) {
      const attributes = attributesManager.getSessionAttributes() || {};
      attributes.state = states.OFFER_DIRECTIONS;
      attributes.latitude = restrooms[0].latitude;
      attributes.longitude = restrooms[0].longitude;
      attributesManager.setSessionAttributes(attributes);
    }

    // TODO: We can't always say 'this and more results'. What if there was only one result?
    const builder = responseBuilder
      .speak(`I found this ${isPositivelyRated(restrooms[0]) ? `positively rated ` : ``}restroom at <say-as interpret-as="digits">${zipcode}</say-as>. ${IntentHelper.describeRestroom(restrooms[0])}.${emailAddress ? ` I also sent this and more restrooms to your email. ${offerDirections ? `Shall I load a map with directions to this restroom?` : ``}` : ` ${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}`}`)
      .addDirective(IntentHelper.buildAPLDirective(zipcode, restrooms, !emailAddress))
      .withShouldEndSession(!offerDirections);

    if (!emailAddress) builder.withAskForPermissionsConsentCard([scopes.EMAIL_SCOPE]);
    else builder.withSimpleCard(...IntentHelper.buildSimpleCard(zipcode, restrooms));

    return builder.getResponse();
  }
}

/**
 * TODO doc
 */
function getZipcode(handlerInput) {
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
  //TODO validate zipcode
  return sessionAttributes.zipcode;
}
