const EmailValidator = require("email-validator");

const RR = require("gateway/RefugeeRestrooms");
const Mailer = require("gateway/Mailer.js");
const zipcodes = require("gateway/Zipcodes");

const APL_CONSTANTS = require("constants/APL");
const APL_DOCUMENT_TYPE = APL_CONSTANTS.APL_DOCUMENT_TYPE;
const APL_DOCUMENT_VERSION = APL_CONSTANTS.APL_DOCUMENT_VERSION;
const restroomDetailsDocument = require("apl/document/RestroomDetailsDocument.json");
const restroomDetailsDatasource = require("apl/data/RestroomDetailsDatasource");

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
        .speak(`Sorry. <say-as interpret-as="digits">${zipcode}</say-as> is not a valid zipcode in the US. Please try again with a valid five digit U.S. zipcode.`)
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

    const emailAddress = await getEmailAddress(handlerInput);
    if (emailAddress) {
      // Is it possible to not wait on sending the email?
      await Mailer.sendEmail(emailAddress, "at " + zipcode, restrooms);
      console.log("We have the user's email address. An email was sent with the search results.");
    }

    return responseBuilder
      .speak(`I found this restroom at <say-as interpret-as="digits">${zipcode}</say-as>. ${describeRestroom(restrooms[0])}. I also sent the details to your email.`)
      .withSimpleCard(...buildSimpleCard(zipcode, restrooms))
      .addDirective(buildAPLDirective(zipcode, restrooms[0]))
      .withShouldEndSession(true)
      .getResponse();
  }
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
    // Special handle the case where consent token exists but it doesn't give access to email.
    console.log(`Unexpected error while trying to fetch user profile: ${error}`);
  }

  console.log("Email Address: " + emailAddress);
  if (!EmailValidator.validate(emailAddress)) return null;
  return emailAddress;
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

function buildSimpleCard(zipcode, restrooms) {
  let content = ``;

  restrooms.slice(0, 4).forEach(restroom => content += `
${visuallyDescribeRestroom(restroom)}
Directions: ${restroom.directions ? `${restroom.directions}` : `Not Available`}
Unisex: ${restroom.unisex ? 'Yes' : 'No'}, Accessible: ${restroom.accessible ? 'Yes' : 'No'}, Changing Table: ${restroom.changing_table ? 'Yes' : 'No'}
`);

  return [
    `Here are some restrooms at ${zipcode}`,
    content
  ]
}

function buildAPLDirective(zipcode, restroom) {
  return {
    type: APL_DOCUMENT_TYPE,
    version: APL_DOCUMENT_VERSION,
    document: restroomDetailsDocument,
    datasources: restroomDetailsDatasource(
      `Here is a restroom at ${zipcode}.`,
      `${restroom.name}\<br\>${restroom.street}, ${restroom.city}, ${restroom.state}`,
      `Gender Neutral: ${restroom.unisex ? '&\#9989;' : '&\#10060;'}\<br\>Accessible: ${restroom.accessible ? '&\#9989;' : '&\#10060;'}\<br\>Changing Table: ${restroom.changing_table ? '&\#9989;' : '&\#10060;'}`
    )
  }
}
