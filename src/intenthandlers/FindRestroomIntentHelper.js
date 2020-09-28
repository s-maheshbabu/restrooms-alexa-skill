const APL_CONSTANTS = require("constants/APL");
const APL_DOCUMENT_TYPE = APL_CONSTANTS.APL_DOCUMENT_TYPE;
const APL_DOCUMENT_VERSION = APL_CONSTANTS.APL_DOCUMENT_VERSION;
const restroomDetailsDocument = require("apl/document/RestroomDetailsDocument.json");
const restroomDetailsDatasource = require("apl/data/RestroomDetailsDatasource");

const searchfilters = require("constants/SearchFilters").searchfilters;

const EmailValidator = require("email-validator");
const messages = require("constants/Messages").messages;
const ratings = require("constants/Constants").ratings;

/**
 * An SSML description of the given restroom.
 */
function describeRestroom(restroom) {
    return `<s>${restroom.name}</s> <say-as interpret-as="address"> ${restroom.street} </say-as>, ${restroom.city}`;
}

/**
 * Constructs a simple Alexa companion app card using the given restrooms.
 * 
 * @param {*} zipcode The zipcode at which the restrooms are located.
 * @param {*} restrooms The restrooms to be used to build the Alexa card.
 * TODO: Validate inputs and update documentation.
 */
function buildSimpleCard(zipcode, restrooms) {
    let content = ``;

    restrooms.slice(0, 4).forEach(restroom => content += `
${visuallyDescribeRestroom(restroom)}
Rating: ${Number.isInteger(restroom.positive_rating) ? `${restroom.positive_rating}% positive` : `Not Rated`}
Directions: ${restroom.directions ? `${restroom.directions}` : `Not Available`}
Unisex: ${restroom.unisex ? 'Yes' : 'No'}, Accessible: ${restroom.accessible ? 'Yes' : 'No'}, Changing Table: ${restroom.changing_table ? 'Yes' : 'No'}
`);

    return [
        `${zipcode ? `Here are some restrooms at ${zipcode}` : `Here are some restrooms near you.`}`,
        content
    ]
}

/**
 * Constructs an APL directive to display the given restroom's details.
 *
 * @param {*} zipcode The zipcode at which the restrooms are located.
 * @param {*} restrooms The restrooms to be used to build the Alexa card.
 * @param {*} isRequestEmailAccess true if we should render information advertising
 * the email capabilities and requesting the user to consider granting permission.
 * TODO: Validate inputs and update documentation.
 */
function buildAPLDirective(zipcode, restroom, isRequestEmailAccess) {
    const distance = zipcode ? `` : `\<br\>&#128663; ${restroom.distance} miles`;
    const rating = `\<br\>&#10084; ${Number.isInteger(restroom.positive_rating) ? `${restroom.positive_rating}% positive` : `Not Rated`}`

    return {
        type: APL_DOCUMENT_TYPE,
        version: APL_DOCUMENT_VERSION,
        document: restroomDetailsDocument,
        datasources: restroomDetailsDatasource(
            `${zipcode ? `Here is a restroom at ${zipcode}.` : `Here is a restroom near you.`}`,
            `${restroom.name}\<br\>${restroom.street}, ${restroom.city}, ${restroom.state}`,
            `${restroom.unisex ? '&\#9989;' : '&\#10060;'} Gender Neutral\<br\>${restroom.accessible ? '&\#9989;' : '&\#10060;'} Accessible\<br\>${restroom.changing_table ? '&\#9989;' : '&\#10060;'} Changing Table${distance}${rating}`,
            `${!isRequestEmailAccess ? `I also sent this and other restrooms I found to your email. I also included Google Maps™ navigation links in the email.` : `${messages.NOTIFY_MISSING_EMAIL_PERMISSIONS}`}`,
        )
    }
}

function isPositivelyRated(restroom) {
    if (!restroom) return false;
    return !isNaN(restroom.positive_rating) && restroom.positive_rating >= ratings.POSITIVE ? true : false;
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
 * Checks for permissions to access the user's email address and returns
 * a valid email address is available. Returns null otherwise.
 */
async function getEmailAddress(handlerInput) {
    const { requestEnvelope, serviceClientFactory } = handlerInput;

    let emailAddress = null;
    const consentToken = requestEnvelope.context.System.apiAccessToken;
    if (!consentToken) {
        console.log(`User hasn't granted permissions to access their profile information.`);
        return emailAddress;
    }

    try {
        const client = serviceClientFactory.getUpsServiceClient();
        emailAddress = await client.getProfileEmail();
    } catch (error) {
        if (error.statusCode === 403)
            console.log(`User hasn't granted permissions to access their profile information. Error: ${error}`);
        else
            console.log(`An unexpected error occurred while trying to fetch user profile: ${error}`);
    }

    if (!EmailValidator.validate(emailAddress)) return null;
    return emailAddress;
}

/**
 * A displayable description of a restroom.
 */
function visuallyDescribeRestroom(restroom) {
    return `${restroom.name}, ${restroom.street}, ${restroom.city}, ${restroom.state}`;
}

module.exports = {
    buildAPLDirective: buildAPLDirective,
    buildSimpleCard: buildSimpleCard,
    describeRestroom: describeRestroom,
    getEmailAddress: getEmailAddress,
    getSearchFilters: getSearchFilters,
    isPositivelyRated: isPositivelyRated,
};