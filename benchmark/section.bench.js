'use strict';

var	expect = require('expect.js'),
	fs = require('fs'),
	lib = require('../lib'),
	generate = require('./gendata').generate;


var dbPath = './testdb',
	docsCount = process.env.NODE_TD_COUNT || 10000,
	db = null;

describe('benchmark', function() {
	it('remove previous and create new test db', function(done) {
		if (fs.existsSync(dbPath)) {
			lib.db.destroy(dbPath, createDb);
		} else {
			createDb();
		}
		function createDb(err) {
			if (err) {done(err); return;}
			var ldb = lib.db(dbPath, {
				valueEncoding: 'json'
			});
			db = {
				users: new lib.DocsSection(ldb, 'users', {projections: [
					{key: {firstName: 1, lastName: 1, id: 1}},
					{key: {birthday: 1, id: 1}},
					{key: {cityOfBirt: 1, occupation: 1, birthday: 1, id: 1}},
					{key: {occupation: 1, birthday: 1, id: 1}}
				]})
			};
			done();
		}
	});

	var docs = null;
	it('generate ' + docsCount + ' test users', function(done) {
		docs = generate(docsCount);
		done();
	});

	it('put all docs to db', function(done) {
		db.users.put(docs, done);
	});

	it('get by id (from start)', function(done) {
		db.users.get({id: 1}, function(err, doc) {
			if (err) {done(err); return;}
			expect(doc).ok();
			done();
		});
	});

	it('get by id (from middle)', function(done) {
		db.users.get({id: Math.round(docsCount / 2)}, function(err, doc) {
			if (err) {done(err); return;}
			expect(doc).ok();
			done();
		});
	});

	it('get by id (from end)', function(done) {
		db.users.get({id: docsCount}, function(err, doc) {
			if (err) {done(err); return;}
			expect(doc).ok();
			done();
		});
	});

	it('find users by first and lastname', function(done) {
		db.users.find({
			start: {firstName: 'Elina', lastName: 'Simons'},
		}, function(err, docs) {
			if (err) {done(err); return;}
			console.log('result count: ', docs.length);
			done();
		});
	});

	it('find users by city and occupation', function(done) {
		db.users.find({
			start: {cityOfBirt: 'Clintwood', occupation: 'Paper Conservator'},
		}, function(err, docs) {
			if (err) {done(err); return;}
			console.log('result count: ', docs.length);
			done();
		});
	});

	it('find users by birthday', function(done) {
		db.users.find({
			start: {birthday: new Date('October 01, 1990 00:00:00').getTime()},
			end: {birthday: new Date('December 01, 1990 00:00:00').getTime()}
		}, function(err, docs) {
			if (err) {done(err); return;}
			console.log('result count: ', docs.length);
			done();
		});
	});

	it('update document (from middle)', function(done) {
		db.users.get({id: Math.round(docsCount / 2)}, function(err, doc) {
			if (err) {done(err); return;}
			doc.firstName += ' 1';
			doc.occupation += ' 1';
			doc.birthday += 1;
			doc.cityOfBirt += ' 1';
			db.users.put(doc, done);
		});
	});
});

