const unitUnderTest = require("../../src/index");
const utilities = require("../../src/utilities");

const expect = require("chai").expect;
const importFresh = require('import-fresh');

const context = {};

describe("FindRestRoomNearMe API handler tests", function () {
  it("should delegate to skill with the right resolved search filters loaded into session attributes", async () => {
    const eventWithAPL = importFresh("../../test-data/api/nearme_api");
    const eventWithoutAPL = importFresh("../../test-data/api/nearme_no_apl_api");

    const synonymsToIdMap = utilities.slotSynonymsToIdMap("RestRoomTypes");
    const allSynonyms = [...synonymsToIdMap.keys()];

    const events = [eventWithAPL, eventWithoutAPL];
    for (var index = 0; index < events.length; index++) {
      const event = events[index]

      for (var i = 0; i < 1000; i++) {
        // Simulate 0 to 3 search filters randomly.
        const randomTestSetSize = Math.floor(Math.random() * Math.floor(4));

        const aTestSetOfSynonyms = getRandom(allSynonyms, randomTestSetSize);

        let expectedResolvedEntitiesSet = new Set();
        aTestSetOfSynonyms.forEach(synonym =>
          expectedResolvedEntitiesSet = expectedResolvedEntitiesSet.add(synonymsToIdMap.get(synonym))
        )

        event.request.apiRequest.arguments.SearchFiltersList = aTestSetOfSynonyms;

        const responseContainer = await unitUnderTest.handler(event, context);
        const response = responseContainer.response;
        const directive = response.directives[0];
        expect(directive.type).to.equal(`Dialog.DelegateRequest`);
        expect(directive.target).to.equal(`skill`);
        expect(directive.period.until).to.equal(`EXPLICIT_RETURN`);
        expect(directive.updatedRequest.type).to.equal(`IntentRequest`);
        expect(directive.updatedRequest.intent.name).to.equal(`FindRestroomNearMeIntent`);

        const actualResolvedEntitiesArray = context.search_filters;
        const expectedResolvedEntitiesArray = [...expectedResolvedEntitiesSet];

        expect(actualResolvedEntitiesArray).to.eql(expectedResolvedEntitiesArray);
      }
    }
  });
});

/**
 * Helper method to fetch n random elements from an array.
 */
function getRandom(array, n) {
  var result = new Array(n),
    len = array.length,
    taken = new Array(len);
  if (n > len)
    throw new RangeError("getRandom: more elements taken than available");
  while (n--) {
    var x = Math.floor(Math.random() * len);
    result[n] = array[x in taken ? taken[x] : x];
    taken[x] = --len in taken ? taken[len] : len;
  }
  return result;
}