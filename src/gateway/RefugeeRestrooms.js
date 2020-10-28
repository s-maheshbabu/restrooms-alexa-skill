const fetch = require("node-fetch");
const determinePositiveRatingPercentage = require("../utilities").determinePositiveRatingPercentage;

const BASE_URL = `https://www.refugerestrooms.org`;
const RR_API_LATENCY = `refugee-restrooms-api-latency`;

async function searchRestroomsByLatLon(latitude, longitude, isFilterByADA, isFilterByUnisex, isFilterByChangingTable) {
    if (!latitude || !longitude)
        throw TypeError(`Latitude and Longitude are required fields. Latitude: ${latitude} and Longitude: ${longitude}`);

    let URL = `${BASE_URL}/api/v1/restrooms/by_location?page=1&per_page=10&offset=0&ada=${isFilterByADA === true ? `true` : `false`}&unisex=${isFilterByUnisex === true ? `true` : `false`}&lat=${latitude}&lng=${longitude}`;
    console.log(`Endpoint ${URL}`);

    console.time(RR_API_LATENCY);
    var restroomsArray = [];
    try {
        const response = await fetch(URL);
        restroomsArray = await response.json();
    } catch (error) {
        console.log(error);
    }
    console.timeEnd(RR_API_LATENCY);

    if (isFilterByChangingTable === true) {
        filterInPlace(restroomsArray, value => value.changing_table);
    }

    // Round down distance to two decimal places and calculate postive rating percentage.
    restroomsArray.forEach(restroom => {
        restroom.distance = Math.round((restroom.distance + Number.EPSILON) * 100) / 100;
        restroom.positive_rating = determinePositiveRatingPercentage(restroom);
    });
    return restroomsArray;
}

function filterInPlace(a, condition, thisArg) {
    let j = 0;
    a.forEach((e, i) => {
        if (condition.call(thisArg, e, i, a)) {
            if (i !== j) a[j] = e;
            j++;
        }
    });

    a.length = j;
    return a;
}

module.exports = {
    BASE_URL: BASE_URL,
    searchRestroomsByLatLon: searchRestroomsByLatLon,
};