'use strict';

var inherits = require('util').inherits;


function BaseSection(db, name) {
	this.db = db;
	if (!db) throw new Error('`db` for batch is not set');
	if (!name) throw new Error('`name` for batch is not set');
	this.name = name;
}

BaseSection.prototype.separator = '~';
BaseSection.prototype.end = '\xff';


/**
 * Value section constructor accepts `db`, `name` and returns instance of section
 */
function ValSection(db, name) {
	BaseSection.call(this, db, name);
}

inherits(ValSection, BaseSection);

/**
 * Put value to section accepts
 * @param {Any} value
 * @param {Function} [callback(err)]
 */
ValSection.prototype.put = function(value, callback) {
	this.db.put(this.name, value, callback);
};

/**
 * Get value from section
 * @param {Function} callback(err,value)
 */
ValSection.prototype.get = function(callback) {
	this.db.get(this.name, callback);
};

/**
 * Delete value from section
 * @param {Function} [callback(err)]
 */
ValSection.prototype.del = function(callback) {
	this.db.del(this.name, callback);
};


function DocsSection(db, name, options) {
	BaseSection.call(this, db, name);
	options = options || {};
	this.projections = [{key: {id: 1}}].concat(options.projections || []);
}

inherits(DocsSection, BaseSection);

DocsSection.prototype.put = function(docs, callback) {
	var self = this;
	if (!Array.isArray(docs)) docs = [docs];

	if (docs.length === 0) {callback(new Error('Nothing to put')); return;}

	var err = this._validateDocs(docs);
	if (err) {callback(err); return;}

	var docsReady = 0,
		operations = [];

	docs.forEach(function(doc) {
		self.get({id: doc.id}, function(err, oldDoc) {
			// TODO: check exactly for NotFound error
			self.projections.forEach(function(projection) {
				var projKey = self._getProjKey(doc, projection);
				if (oldDoc) {
					var oldProjKey = self._getProjKey(oldDoc, projection);
					if (projKey !== oldProjKey) operations.push({
						type: 'del',
						key: oldProjKey
					});
				}
				operations.push({type: 'put', key: projKey, value: doc});
			});
			docsReady++;
			// exec batch after all operations was generated
			if (docsReady === docs.length) self.db.batch(operations, callback);
		});
	});
};

DocsSection.prototype._validateDocs = function(docs) {
	if (!Array.isArray(docs)) docs = [docs];
	for (var i = 0; i < docs.length; i++) {
		var doc = docs[i];
		var err = null;
		if (typeof doc !== 'object') {
			err = new Error(
				'Document should be an `object`: ' + JSON.stringify(doc)
			);
		} else if ('id' in doc === false) {
			err = new Error('Document doesn`t have `id`: ' + JSON.stringify(doc));
		}
		if (err) return err;
	}
};

DocsSection.prototype._getProjKey = function(doc, projection) {
	var projKey = [this.name];
	for (var key in projection.key) {
		var value = null;
		if (typeof projection.key[key] === 'function') {
			value = projection.key[key](doc);
		} else {
			value = doc[key];
		}
		projKey.push(key + ':' + value);
	}
	return projKey.join(this.separator);
}

DocsSection.prototype.find = function(params, callback) {
	// clone params to prevent side effects
	params = extend({}, params);
	callback = callback || noop;
	var self = this;
	if (!params.start && params.end) {
		callback(new Error('`end` selected without `start`'));
		return;
	}
	// using `id` projection for finding all
	if (!params.start) params.start = {id: ''};
	params.start = self._getStrKey(params.start);
	params.end = params.end ? self._getStrKey(params.end) : params.start;
	// add end character
	params.end += self.end;
	params.keys = 'keys' in params ? params.keys : true;
	params.values = 'values' in params ? params.values : true;

	var result = [];

	var dataIter = null;
	if (params.keys && params.values) {
		dataIter = function(data) {
			result.push(data.value);
		}
	} else {
		dataIter = function(data) {
			result.push(data);
		}
	}
	self.db.createReadStream(params)
		.on('data', dataIter)
		.on('end', function() {
			callback(null, result);
		}).on('error', callback);
};

DocsSection.prototype._getStrKey = function(objKey) {
	var strKey = [this.name];
	for (var key in objKey) {
		strKey.push(key + ':' + objKey[key]);
	}
	return strKey.join(this.separator);
}

DocsSection.prototype.get = function(key, callback) {
	this.db.get(this._getStrKey(key), callback);
};

DocsSection.prototype.del = function(ids, callback) {
	var self = this;
	if (!Array.isArray(ids)) ids = [ids];
	if (ids.length === 0) {callback(new Error('Nothing to del')); return;}
	var firstDoc = ids[0];
	if (typeof firstDoc === 'object') {
		var err = this._validateDocs(ids);
		if (err) {callback(err); return;}
		ids = ids.map(function(doc) {
			return doc.id;
		});
	}

	var docsReady = 0,
		operations = [];

	ids.forEach(function(id) {
		self.get({id: id}, function(err, oldDoc) {
			// TODO: check exactly for NotFound error
			if (oldDoc) {
				self.projections.forEach(function(projection) {
					operations.push({
						type: 'del',
						key: self._getProjKey(oldDoc, projection)
					});
				});
				docsReady++;
			} else {
				docsReady++;
			}
			if (docsReady === ids.length) self.db.batch(operations, callback);
		});
	});
};


function noop() {};

function extend(dst, src) {
	for (var key in src) {dst[key] = src[key];}
	return dst;
};

exports.db = require('level');
exports.ValSection = ValSection;
exports.DocsSection = DocsSection;
