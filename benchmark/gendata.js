'use strict';

function generate(n) {
	var docs = [];
	for (var i = 0; i < n; i++) {
		var firstName = getRandomFirstName(),
			lastName = getRandomLastName(),
			fullName = firstName + ' ' + lastName;
		var doc = {
			id: i + 1,
			firstName: firstName,
			lastName: lastName,
			fullName: fullName,
			email: fullName.toLowerCase().replace(' ', '.') + '@mail.com',
			phone: getRandomNumber(),
			birthday: getRandomInt(
				new Date('October 01, 1970 00:00:00').getTime(),
				new Date().getTime()
			),
			cityOfBirt: getRandomCity(),
			occupation: getRandomOccupation(),
			resume: 'Lorem ipsum dolor sit amet, consectetur adipisicing ' +
			'elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
		};
		docs.push(doc);
	}
	return docs;
}

/**
 * Helpers use above
 */

var firstNames = [
	'Elina',
	'Dillon',
	'Saundra',
	'Harmony',
	'Ellie',
	'Erlinda',
	'Nancie',
	'Carol',
	'Pearly',
	'Mabel',
	'Eugena',
	'Cyrus',
	'Delena',
	'Shenita',
	'Aisha',
	'Nikita',
	'Lavette',
	'Alisia',
	'Tanisha',
	'Margorie'
];

var lastNames = [
	'Panek',
	'Simons',
	'Severin',
	'Brazell',
	'Polasek',
	'Shannon',
	'Kowalski',
	'Royse',
	'Mazon',
	'Gipe',
	'Wilks',
	'Shah',
	'Scheuerman',
	'Henery',
	'Monzo',
	'Sigmund',
	'Longwell',
	'Strouth',
	'Maclin',
	'Hodes'
];

var getRandomFirstName = randomArrayItem(firstNames);
var getRandomLastName = randomArrayItem(lastNames);

function getRandomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomNumber() {
	var number = '+79';
	for (var i = 0; i < 9; i++) {
		number += getRandomInt(0, 9);
	}
	return number;
}

function randomArrayItem(array) {
	return function() {
		return array[getRandomInt(0, array.length - 1)];
	}
}

var cities = [
	'Biloxi',
	'De Kalb',
	'Willow Park',
	'Clintwood',
	'Radar Base',
	'Gang Mills',
	'Palo Cedro',
	'Ryderwood',
	'New Baden',
	'Clewiston',
	'Pollock',
	'Citrus Hills',
	'Salemburg',
	'Glasgow',
	'Los Minerales',
	'Las Maravillas',
	'Wilmar',
	'Brookridge',
	'Summerhill',
	'Guy'
];

var getRandomCity = randomArrayItem(cities);

var occupations = [
	'Gaming Manager',
	'Deli Clerk',
	'Computer Assembler',
	'Correction Officer',
	'Information Management Officer',
	'Agricultural Economics Professor',
	'Safety Coordinator',
	'Advertising Manager',
	'Gccs Cop/M Operator',
	'Paper Conservator',
	'Map Maker',
	'Certified Nurse Midwife (CNM)',
	'Product Safety Test Engineer',
	'Control System Computer Scientist',
	'Drug Abuse Counselor',
	'Personnel Coordinator',
	'Family Preservation Worker',
	'Clay Mine Cutting Machine Operator',
	'School Psychometrist',
	'Student Advisor'
];

var getRandomOccupation = randomArrayItem(occupations);


exports.generate = generate;
