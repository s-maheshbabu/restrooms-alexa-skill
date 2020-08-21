const RR = require("gateway/RefugeeRestrooms");
const zipcodes = require("gateway/Zipcodes");

const searchfilters = require("constants/SearchFilters").searchfilters;

module.exports = FindRestroomAtLocationIntentHandler = {
  canHandle(handlerInput) {
    return (
      handlerInput.requestEnvelope.request.type === "IntentRequest" &&
      (handlerInput.requestEnvelope.request.intent.name === "FindRestroomAtLocationIntent")
    );
  },
  async handle(handlerInput) {
    const { responseBuilder } = handlerInput;

    const zipcode = getZipcode(handlerInput);
    // If zipcode is missing or invalid, render error messages.
    console.log(`Searching for restrooms in zipcode: ${zipcode}`);
    const coordinates = zipcodes.getCoordinates(zipcode);
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
        .speak(`I'm sorry. I couldn't find any restrooms at <say-as interpret-as="digits">${zipcode}</say-as> matching your criteria.`)
        .withShouldEndSession(true)
        .getResponse();
    }

    return responseBuilder
      .speak(`I found this restroom at <say-as interpret-as="digits">${zipcode}</say-as>. ${describeRestroom(restrooms[0])}`)
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
}

/**
 * doc
 */
function getZipcode(handlerInput) {
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
  //TBD validate zipcode
  return sessionAttributes.zipcode;
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
