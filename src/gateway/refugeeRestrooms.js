const fetch = require("node-fetch");

const BASE_URL = `https://www.refugerestrooms.org`;

async function searchRestroomsByLatLon(latitude, longitude) {
    const URL = `${BASE_URL}/api/v1/restrooms/by_location?page=1&per_page=10&offset=0&lat=${latitude}&lng=${longitude}`;
    console.log(`Endpoint ${URL}`);

    var restroomsArray;
    try {
        const response = await fetch(URL);
        restroomsArray = await response.json();
    } catch (error) {
        console.log(error);
    }

    return restroomsArray;
}

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        try {
            await callback(array[index], index, array);
        } catch (error) {
            console.log(error);
        }
    }
}

module.exports = {
    BASE_URL: BASE_URL,
    searchRestroomsByLatLon: searchRestroomsByLatLon,
};