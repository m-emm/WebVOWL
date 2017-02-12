var util = require('util');
var _ = require('lodash');

var rdf_type = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
var rdf_subProperty = 'http://www.w3.org/2000/01/rdf-schema#subPropertyOf';
var rdf_range = 'http://www.w3.org/2000/01/rdf-schema#range';
var rdf_domain = 'http://www.w3.org/2000/01/rdf-schema#domain';
var rdf_subClassOf = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
var owl_class = 'http://www.w3.org/2002/07/owl#Class';
var owl_transitive = 'http://www.w3.org/2002/07/owl#TransitiveProperty';
var owl_inverse = 'http://www.w3.org/2002/07/owl#inverseOf';
var owl_symmetric = 'http://www.w3.org/2002/07/owl#SymmetricProperty';
var owl_objectProperty = 'http://www.w3.org/2002/07/owl#ObjectProperty';
var owl_equivalentClass = 'http://www.w3.org/2002/07/owl#equivalentClass';
var owl_namedIndividual= 'http://www.w3.org/2002/07/owl#NamedIndividual';

function isSymmetric(store, subject) {
	return store.holds(subject, store.sym(rdf_type), store.sym(owl_symmetric));
}

function getInverses(store, subject) {
	var statements = store.match(subject, store.sym(owl_inverse), undefined);
	var statements2 = store.match(undefined, store.sym(owl_inverse), subject);
	var retval = statements.map(function(elem) {
		return elem.object.value
	}).concat(statements2.map(function(elem) {
		return elem.subject.value
	}));
	if (isSymmetric(store, subject)) {
		retval.push(subject.value);
	}
	return retval;
}

function removeBrackets(text) {
	var retval = _.trimEnd(text, '>')
	if (retval.substr(0, 1) == '<') {
		retval = retval.substr(1);
	}
	return retval;
}

function getStatementObject(store, subject, predicate) {
	var statement = store.anyStatementMatching(subject, predicate, undefined);
	if (!statement || !statement.object || !statement.object.value)
		return null;
	return statement.object.value;
}

function getAnnotation(store, entity, annotation) {
	return getStatementObject(store, store.sym(removeBrackets(entity)), store.sym(annotation));
}

function getReadableRepresentation(store, entity) {
	var retval = {};
	var entityName = removeBrackets(entity);
	if (entity.value) {
		entityName = entity.value;
	}
	retval.name = entityName;
	retval.shortName = _.trimEnd(entityName.split('#')[1], '>')
	for ( var key in annotations) {
		var value = getAnnotation(store, entityName, annotations[key]);
		if (value) {
			retval[key] = value;
		}
	}
	return retval;
}

var annotations = {
	comment : 'http://www.w3.org/2000/01/rdf-schema#comment',
	label : 'http://www.w3.org/2000/01/rdf-schema#label',
	seeAlso : 'http://www.w3.org/2000/01/rdf-schema#seeAlso'
};

module.exports = {

	getCommentAnnotation : function(store, entity) {
		return getAnnotation(store, entity, 'http://www.w3.org/2000/01/rdf-schema#comment');
	},
	getLabelAnnotation : function(store, entity) {
		return getAnnotation(store, entity, 'http://www.w3.org/2000/01/rdf-schema#label');
	},
	getSeeAlsoAnnotation : function(store, entity) {
		return getAnnotation(store, entity, 'http://www.w3.org/2000/01/rdf-schema#seeAlso');
	},

	getReadableRepresentation : getReadableRepresentation,

	isIndividual : function(store, subject) {
		return store.holds(subject, store.sym(rdf_type), store.sym(owl_namedIndividual));
	},

	isClass : function(store, subject) {
		return store.holds(subject, store.sym(rdf_type), store.sym(owl_class));
	},

	isTransitive : function(store, subject) {
		return store.holds(subject, store.sym(rdf_type), store.sym(owl_transitive));
	},
	isSymmetric : isSymmetric,

	getInverses : getInverses,

	getInverseProperties : function(store, subject) {
		var retval = [];
		var allProperties = store.match(undefined, store.sym(rdf_type), store.sym(owl_objectProperty));

		allProperties.forEach(function(elem) {
			var property = elem.subject.value;
			// console.log('Looking at: ' + util.inspect(property) );
			var inverses = getInverses(store, store.sym(property));
			// console.log('Inverses: ' + util.inspect(inverses) );

			if (inverses.length > 0) {
				var targeted = store.match(undefined, store.sym(property), subject);
				targeted.forEach(function(targetStatement) {
					inverses.forEach(function(inverseRelation) {
						retval.push({
							subject : subject,
							relation : inverseRelation,
							target : targetStatement.subject.value
						});
					});
				});
			}

		})
		return retval;
	},

	getTransitiveTargets : function(store, start, relation) {
		var types = {};
		types[start.toNT()] = true;
		var result = store.transitiveClosure(types, relation);

		return _.toPairs(result).map(function(elem) {
			return elem[0]
		}).map(function(elem) {
			return _.trim(elem, '>').substring(1);
		});
	},

	findEquivalentClasses : function(store, targetNode) {
		var equivalentMatchesForward = store.match(undefined, store.sym(owl_equivalentClass), targetNode);

		var equivalentMatchesNames = equivalentMatchesForward.map(function(elem) {
			return elem.subject.value.toString();
		});

		var equivalentMatchesBackward = store.match(targetNode, store.sym(owl_equivalentClass), undefined);

		var equivalentMatchesBackwardNames = equivalentMatchesBackward.map(function(elem) {
			return elem.object.value.toString()
		});

		var namesUnion = _.union(equivalentMatchesNames, equivalentMatchesBackwardNames);
		_.remove(namesUnion, function(elem) {
			return elem.toString() == targetNode.value.toString();
		});

		var inferredClasses = [];
		namesUnion.forEach(function(elem) {
			inferredClasses.push(store.sym(elem));
		});

		return inferredClasses;
	},

	findMembers : function(store, targetNode, includeEquivalent) {

		var classes = [ targetNode ];
		if (includeEquivalent) {
			var equivalentMatchesForward = store.match(undefined, store.sym(owl_equivalentClass), undefined);

			var equivalentMatchesNames = equivalentMatchesForward.map(function(elem) {
				return elem.subject.value.toString();
			});

			var equivalentMatchesBackward = store.match(targetNode, store.sym(owl_equivalentClass), undefined);

			var equivalentMatchesBackwardNames = equivalentMatchesBackward.map(function(elem) {
				return elem.object.value.toString()
			});

			
			var namesUnion = _.union(equivalentMatchesNames, equivalentMatchesBackwardNames);
		

			var inferredClasses = [];
			namesUnion.forEach(function(elem) {
				inferredClasses.push(store.sym(elem));
			});
			
			classes = _.union(classes, inferredClasses);

		}

		var retvalRaw = [];
		classes.forEach(function(elem) {
			var members = store.findMembersNT(elem);
			return retvalRaw.push(members);
		});

		var retvalPairs = _.flatten(retvalRaw.map(_.toPairs));

		var retval = _.map(retvalPairs, function(element) {
			return [ _.trimEnd(element[0], '>').substr(1), element[1], _.trimEnd(element[0].split('#')[1], '>') ];
		});
		return retval;

	},

	shortName : function(uri) {
		return _.trimEnd(uri.split('#')[1], '>');
	},

	properties : function(store) {
		var statements = store.match(undefined, store.sym(rdf_type), store.sym(owl_objectProperty));
		return _.map(statements, function(statement) {
			return statement.subject.value;
		});
	},

	classes : function(store) {
		var statements = store.match(undefined, store.sym(rdf_type), store.sym(owl_class));
		return _.map(statements, function(statement) {
			return statement.subject.value;
		});
	},
	individuals : function(store) {
		var statements = store.match(undefined, store.sym(rdf_type), store.sym(owl_namedIndividual));
		return _.map(statements, function(statement) {
			return statement.subject.value;
		});
	},
	range : function(store, property) {
		var statement = store.anyStatementMatching(store.sym(property), store.sym(rdf_range), undefined);
		if (!statement || !statement.object || !statement.object.value)
			return null;
		return statement.object.value;
	},
	domain : function(store, property) {
		var statement = store.anyStatementMatching(store.sym(property), store.sym(rdf_domain), undefined);
		if (!statement || !statement.object || !statement.object.value)
			return null;
		return statement.object.value;
	},
	allSubClasses : function(store, targetNode) {
		var subtypes = _.toPairs(store.findSubClassesNT(targetNode));
		subtypes = _.map(subtypes, function(element) {
			return getReadableRepresentation(store, element[0]).name;
		});
		_.remove(subtypes, function(element) {
			return (element === targetNode.value);
		});
		return subtypes;
	},
	subClasses : function(store, targetNode) {
		var statements = store.match(undefined, store.sym(rdf_subClassOf), targetNode);
		return _.map(statements, function(statement) {
			return statement.subject.value;
		});
	},
	superClasses : function(store, targetNode) {
		var statements = store.match(targetNode, store.sym(rdf_subClassOf), undefined);
		return _.map(statements, function(statement) {
			return statement.object.value;
		});
	},
	individualsOfClass : function(store, targetName) {
		var statements = store.match(undefined, store.sym(rdf_type), store.sym(targetName));
		var retval = [];
		statements.forEach(function(element) {
			if (store.holds(element.subject, store.sym(rdf_type), store.sym(owl_namedIndividual))) {
				retval.push(element.subject.value);
			}
		});
		return retval;
	},
	propertyEdges : function(store, property) {
		var statements = store.match(undefined, store.sym(property), undefined);
		var retval = [];
		statements.forEach(function(element) {
			retval.push({
				subject : element.subject.value,
				object : element.object.value
			});
		});
		return retval;
	},

	removeBrackets : removeBrackets,

}
