# nlevel

nlevel - node.js odm for leveldb.
It is built on top of [levelup](https://github.com/rvagg/node-levelup).
The main ideas are to split db on sections (like collections in mongodb)
and provide additional operations for this sections including manipulation with
sets of objects.


## Installation

```
npm install nlevel
```


## Usage

```js

var nlevel = require('nlevel');

// create db
var ldb = nlevel.db('./mydb', {valueEncoding: 'json'});

// store all sections in one object for convenience
var db = {};

// create value section which associate name with arbitrary value
db.cities = new nlevel.ValSection(ldb, 'cities');

db.cities.put(['Elina', 'Dillon', 'Saundra', 'Harmony'], function(err) {
	db.cities.get(function(err, cities) {
		if (err) throw err;
		// prints our array: [ 'Elina', 'Dillon', 'Saundra', 'Harmony' ]
		console.log(cities);
	});
});


// create documents section with projections (key order matters)
db.tasks = new nlevel.DocsSection(ldb, 'tasks', {
	projections: [
		// projection 1
		{key: {project: 1, version: 1, assignee: 1, id: 1}},
		// projection 2
		{key: {assignee: 1, project: 1, version: 1, id: 1}}
	]
});

// put all tasks in a batch
db.tasks.put([{
	id: 1, project: 'proj 1', version: '1.0.0', assignee: 'bob', done: true
}, {
	id: 2, project: 'proj 1', version: '1.0.0', assignee: 'jane', done: false
}, {
	id: 3, project: 'proj 2', version: '2.0', assignee: 'bob', done: true
}, {
	id: 4, project: 'proj 2', version: '2.0', assignee: 'jane', done: true
}, {
	id: 5, project: 'proj 3', version: '0.1', assignee: 'sam', done: true
}, {
	id: 6, project: 'proj 3', version: '0.2', assignee: 'sam', done: false
}], function(err) {
	if (err) throw err;

	// NOTICE: in all calls key order matters

	// find task for selected assignee and project (it uses projection 2)
	db.tasks.find({
		start: {assignee: 'jane', project: 'proj 2'}
	}, function(err, tasks) {
		if (err) throw err;
		// prints [ 4 ]
		console.log(tasks.map(function(task) {return task.id;}));
	});
	
	// find tasks in specific project and version (it uses projection 1)
	db.tasks.find({
		start: {project: 'proj 1', version: '1.0.0'}
	}, function(err, tasks) {
		if (err) throw err;
		// prints [ 1, 2 ]
		console.log(tasks.map(function(task) {return task.id;}));
	});
	
	// get by full key (it uses projection 1)
	db.tasks.get({
		project: 'proj 1',
		version: '1.0.0',
		assignee: 'bob',
		id: 1
	}, function(err, task) {
		if (err) throw err;
		// prints 1
		console.log(task.id);
	});
});

```


## Sections api

coming soon...
