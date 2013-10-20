'use strict';

function Batch(db, prefix, options) {
	options = options || {};
	this.db = db;
	if (!db) throw new Error('`db` for batch is not set');
	if (!prefix) throw new Error('`prefix` for batch is not set');
	this.prefix = prefix;
	this.separator = options.separator || '~';
	this.projections = [['id']].concat(options.projections || []);
}

Batch.prototype.put = function(doc, callback) {
	var self = this;
	if (self.projections.length == 1) {
		self.db.put(self.prefix, doc, callback);
	} else {
		self.get({prefix: self.prefix, id: doc.id}, function(err, oldDoc) {
			// TODO: check exactly for NotFound error
			var operations = [];
			self.projections.forEach(function(projection) {
				var projKey = getProjKey(doc, projection);
				if (oldDoc) {
					var oldProjKey = getProjKey(oldDoc, projection);
					if (projKey != oldProjKey) operations.push({
						type: 'del',
						key: oldProjKey
					});
				}
				operations.push({type: 'put', key: projKey, value: doc});
			});
			self.db.batch(operations, callback);
		});
	}
	function getProjKey(doc, projection) {
		var projKey = [self.prefix];
		projection.forEach(function(key) {
			projKey.push(key + ': ' + doc[key]);
		});
		return projKey.join(self.separator);
	}
};

Batch.prototype.find = function(params, callback) {
	callback = callback || noop;
	var self = this;
	params.start = getStrKey(params.start);
	params.end = params.end ? getStrKey(params.end) : params.start + '\xff';
	params.keys = 'keys' in params ? params.keys : true;
	params.values = 'values' in params ? params.values : true;

	var addData = null;
	if (params.keys && params.values) {
		addData = function(data) {result.push(data.value);}
	} else {
		addData = function(data) {result.push(data);}
	}

	var result = [];
	self.db.createReadStream(params)
		.on('data', addData)
		.on('end', function() {
			callback(null, result);
		}).on('error', callback);

	function getStrKey(objKey) {
		var strKey = [self.prefix];
		for (var key in objKey) {
			strKey.push(key + ': ' + objKey[key]);
		}
		return strKey.join(self.separator);
	}
};

Batch.prototype.get = function(key, callback) {
	if (typeof key === 'function') callback = key;
	this.db.get(this.prefix, callback);
};

Batch.prototype.del = function(key, callback) {
	if (typeof key === 'function') callback = key;
	this.db.del(this.prefix, callback);
};

function noop() {};

exports.Batch = Batch;
