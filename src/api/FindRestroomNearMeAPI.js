const slotnames = require("../constants/SlotNames").slotnames;
const utilities = require("../utilities");

let synonymsToIdMap;

module.exports = FindRestroomNearMeIntentHandler = {
  canHandle(handlerInput) {
    return utilities.isApiRequest(handlerInput, 'FindRestroomsNearMeAPI');
  },
  async handle(handlerInput) {
    const apiArguments = utilities.getApiArguments(handlerInput);

    const { attributesManager } = handlerInput;
    const sessionAttributes = attributesManager.getSessionAttributes();
    sessionAttributes.search_filters = resolveEntities(apiArguments.SearchFiltersList);

    // Sticking the search filters in context just for testing purposes.
    const { context } = handlerInput;
    if (context) context.search_filters = sessionAttributes.search_filters;

    return {
      directives: [{
        type: 'Dialog.DelegateRequest',
        target: 'skill',
        period: {
          until: 'EXPLICIT_RETURN'
        },
        updatedRequest: {
          type: 'IntentRequest',
          intent: {
            name: 'FindRestroomNearMeIntent',
          }
        }
      }],
      apiResponse: {}
    }
  }
}

/**
 * Until Alexa Conversations can do entity resolution for list slots, this method is needed
 * to perform ER ourselves.
 */
function resolveEntities(raw_search_filters) {
  if (!Array.isArray(raw_search_filters)) return raw_search_filters;
  if (!synonymsToIdMap) synonymsToIdMap = utilities.slotSynonymsToIdMap(slotnames.RestRoomTypes);

  const resolved_search_filters = new Set();

  raw_search_filters.forEach(search_filter => {
    if (synonymsToIdMap.has(search_filter)) resolved_search_filters.add(synonymsToIdMap.get(search_filter));
  });

  return [...resolved_search_filters];
}