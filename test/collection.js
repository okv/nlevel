'use strict';

var expect = require('expect.js'),
	levelup = require('level'),
	fs = require('fs'),
	Batch = require('../lib').Batch;


var dbPath = './testdb',
	db = null;

describe('bootstrap', function() {
	it('remove previous and create new test db', function(done) {
		if (fs.existsSync(dbPath)) {
			levelup.destroy(dbPath, createDb);
		} else {
			createDb();
		}
		function createDb(err) {
			if (err) {done(err); return;}
			db = levelup(dbPath, {
				keyEncoding: 'json',
				valueEncoding: 'json'
			});
			done();
		}
	});
});

var tasks = [{
	id: 1,
	title: 'Task 1 at project 1',
	project: 'project 1',
	version: '1.0.0'
}, {
	id: 2,
	title: 'Task 2 at project 1',
	project: 'project 1',
	version: '1.0.0'
}, {
	id: 3,
	title: 'Task 1 at project 2',
	project: 'project 2',
	version: '2.0'
}, {
	id: 4,
	title: 'Task 2 at project 2',
	project: 'project 2',
	version: '2.0'
}, {
	id: 5,
	title: 'Task 1 at project 3',
	project: 'project 3',
	version: '0.1'
}, {
	id: 6,
	title: 'Task 2 at project 3',
	project: 'project 3',
	version: '0.2'
}];

describe('simple batch (without projections)', function() {
	var tasksBatch = null;

	it('will no be created without db or prefix', function(done) {
		expect(function() {
			tasksBatch = new Batch();
		}).throwError('`db` for batch is not set');
		expect(function() {
			tasksBatch = new Batch(db);
		}).throwError('`prefix` for batch is not set');
		done();
	});

	it('created without errors', function(done) {
		tasksBatch = new Batch(db, 'tasks');
		done();
	});

	it('put key and value without errors', function(done) {
		tasksBatch.put(tasks, done);
	});

	it('got value by key', function(done) {
		tasksBatch.get(function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(tasks);
			done();
		});
	});

	it('del by key', function(done) {
		tasksBatch.del(done);
	});

	it('get by key returns NotFound error', function(done) {
		tasksBatch.get(function(err) {
			expect(err).have.property(
				'message', 'Key not found in database [tasks]'
			);
			done();
		});
	});
});
