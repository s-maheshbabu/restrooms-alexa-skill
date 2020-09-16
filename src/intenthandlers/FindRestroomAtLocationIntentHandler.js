const utilities = require("../utilities");

const RR = require("gateway/RefugeeRestrooms");
const Mailer = require("gateway/Mailer.js");
const zipcodes = require("gateway/Zipcodes");

const IntentHelper = require("./FindRestroomIntentHelper");

module.exports = FindRestroomAtLocationIntentHandler = {
  canHandle(handlerInput) {
    return utilities.isIntent(handlerInput, 'FindRestroomAtLocationIntent');
  },
  async handle(handlerInput) {
    const { responseBuilder } = handlerInput;

    const zipcode = getZipcode(handlerInput);
    // If zipcode is missing or invalid, render error messages.
    console.log(`Searching for restrooms in zipcode: ${zipcode}`);
    const coordinates = zipcodes.getCoordinates(zipcode);
    if (!coordinates) {
      return responseBuilder
        .speak(`Sorry. <say-as interpret-as="digits">${zipcode}</say-as> is not a valid zipcode in the US. Please try again with a valid five digit U.S. zipcode.`)
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

    return responseBuilder
      .speak(`I found this restroom at <say-as interpret-as="digits">${zipcode}</say-as>. ${IntentHelper.describeRestroom(restrooms[0])}. I also sent the details to your email.`)
      .withSimpleCard(...IntentHelper.buildSimpleCard(zipcode, restrooms))
      .addDirective(IntentHelper.buildAPLDirective(zipcode, restrooms[0]))
      .withShouldEndSession(true)
      .getResponse();
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
