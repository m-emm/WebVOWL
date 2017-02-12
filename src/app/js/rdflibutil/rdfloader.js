var $rdf = require('rdflib');
var util = require('util');
var rdfutil = require('./rdfutil');
var _ = require('lodash');

var owl_thing = 'http://www.w3.org/2002/07/owl#Thing';
var thingType = 'owl:Thing';
var classType = 'owl:Class';
var subclassType = 'rdfs:SubClassOf';
var propertyType = 'owl:objectProperty';
var individualType = 'owl:namedIndividual';
var rdfsType = 'rdfs:type';

module.exports = {
	parseRdf : parseRdf
};

function parseRdf(text,options) {
	
	options = options || {};

	var rootUri = /^ *<([^>]+)>/m.exec(text)[1];

	var store = $rdf.graph();

	var mimeType = 'text/turtle';

	$rdf.parse(text, store, rootUri, mimeType);
	
	
	if(options.excludeClasses && Array.isArray(options.excludeClasses)) {		
		var allObjects = {};
		options.excludeClasses.forEach(function(element){
			var members = store.findMemberURIs(store.sym(element));
			Object.assign(allObjects,members);			
			var subclasses = store.findSubClassesNT(store.sym(element));
			Object.assign(allObjects,subclasses);
		});		
		var matchingStatements = [];
		_.toPairs(allObjects).forEach(function(element){
			// clear out all traces of these objects
			var uri = rdfutil.removeBrackets(element[0]);
			matchingStatements = matchingStatements.concat(store.statementsMatching(undefined,undefined,store.sym(uri),undefined));
			matchingStatements = matchingStatements.concat(store.statementsMatching(store.sym(uri),undefined,undefined,undefined));
		});	
		matchingStatements.forEach(function(statement){
			if(store.holds(statement)){
				store.remove(statement);	
			}
		});
		
	}
	

	var classes = rdfutil.classes(store);
	classes.unshift(owl_thing);
	
	var properties = rdfutil.properties(store);
	var individuals = rdfutil.individuals(store);

	var propertyEdges = [];
	properties.forEach(function(element) {
		var edges = rdfutil.propertyEdges(store, element);
		edges.forEach(function(edge) {
			propertyEdges.push({
				property : element,
				subject : edge.subject,
				object : edge.object
			});
		});
	});

	var idx = 0;
	var iriMap = {};
	var individualIriMap = {};

	properties = _.map(properties, function(element) {
		var id = idx++;

		var propertyObject = {
			type : propertyType,
			id : id,
			iri : element,
			label : {
				"IRI-based" : $rdf.uri.refTo(rootUri, element).substr(1)
			},
			"attributes" : [ "object" ]
		};
		iriMap[element] = propertyObject;
		return propertyObject;
	});

	classes = _.map(classes, function(element) {
		return {
			iri : element,
			type : classType
		};
	});

	individuals.forEach(function(element) {
		classes.push({
			iri : element,
			type : individualType
		});
	});

	classes = _.map(classes, function(element) {
		var classObject = {

			type : element.type,
			id : idx++,
			iri : element.iri,
			label : {
				"IRI-based" : $rdf.uri.refTo(rootUri, element.iri).substr(1)
			}
		};
		if (classObject.iri === owl_thing) {
			classObject.label = {
				"undefined" : "Thing"
			};
		}

		if (element.type === classType) {
			classObject.individualsRdf = rdfutil.individualsOfClass(store, element.iri);
			iriMap[element.iri] = classObject;
		} else {
			individualIriMap[element.iri] = classObject;
		}
		return classObject;
	});

	classes.forEach(function(element) {
		element.subclassesRdf = rdfutil.subClasses(store, $rdf.sym(element.iri));
		element.superclassesRdf = rdfutil.superClasses(store, $rdf.sym(element.iri));

		element.subClasses = element.subclassesRdf.map(function(element) {
			return iriMap[element].id.toString();
		});
		element.superClasses = element.superclassesRdf.map(function(element) {
			return iriMap[element].id.toString();
		});
	});

	properties.forEach(function(element) {
		element.domain_iri = rdfutil.domain(store, element.iri) || owl_thing;
		element.range_iri = rdfutil.range(store, element.iri) || owl_thing;
		if (iriMap[element.domain_iri] && iriMap[element.domain_iri].id) {
			element.domain = iriMap[element.domain_iri].id;
		}
		if (iriMap[element.range_iri] && iriMap[element.range_iri].id) {
			element.range = iriMap[element.range_iri].id;
		}
	});

	var subclassEdges = {};

	classes.forEach(function(element) {
		if (element.type === classType) {
			element.subclassesRdf.forEach(function(subclass) {
				var edgeKey = element.iri + subclass;
				if (subclassEdges[edgeKey]) {
					console.log("Skipping duplicate inheritance edge: " + element.iri + " -> " + subclass);
				} else {
					var anonymousSubclassProperty = {};
					anonymousSubclassProperty.attributes = [ "anonymous", "object" ];
					anonymousSubclassProperty.type = subclassType;
					if (iriMap[subclass] && iriMap[subclass].id) {
						anonymousSubclassProperty.domain = iriMap[subclass].id;
					}
					if (iriMap[element.iri] && iriMap[element.iri].id) {
						anonymousSubclassProperty.range = iriMap[element.iri].id;
					}
					anonymousSubclassProperty.id = idx++;
					properties.push(anonymousSubclassProperty);
					subclassEdges[edgeKey] = true;
				}
			});
		}
	});

	classes.forEach(function(element) {
		if (element.individualsRdf) {
			element.individualsRdf.forEach(function(individual) {
				var anonimousTypeProperty = {};
				anonimousTypeProperty.attributes = [ "anonymous", "object" ];
				anonimousTypeProperty.type = rdfsType;
				if (individualIriMap[individual] && individualIriMap[individual].id) {
					anonimousTypeProperty.domain = individualIriMap[individual].id;
				}
				if (iriMap[element.iri] && iriMap[element.iri].id) {
					anonimousTypeProperty.range = iriMap[element.iri].id;
				}
				anonimousTypeProperty.id = idx++;
				properties.push(anonimousTypeProperty);
			});
		}
	});

	propertyEdges.forEach(function(element) {
		var objectProperty = {};
		objectProperty.iri = element.property;
		objectProperty.label = {
			"IRI-based" : $rdf.uri.refTo(rootUri, element.property).substr(1)
		};
		objectProperty.attributes = [ "object" ];
		objectProperty.type = propertyType;
		if (individualIriMap[element.subject] && individualIriMap[element.subject].id) {
			objectProperty.domain = individualIriMap[element.subject].id;
		}
		if (individualIriMap[element.object] && individualIriMap[element.object].id) {
			objectProperty.range = individualIriMap[element.object].id;
		}
		objectProperty.id = idx++;
		properties.push(objectProperty);
	});

	var vowl = {};
	vowl.namespace = [];
	vowl.metrics = {
		classCount : classes.length,
		objectPropertyCount : properties.length,
		datatypePropertyCount : 0,
		individualCount : individuals.length
	};
	vowl._comment = "Created in WebVWOL using rdflib.js";
	
	// @Todo: handle prefixes properly
	vowl.header = {
		"baseIris" : [ "http://www.w3.org/2000/01/rdf-schema", rootUri ],
		"iri" : rootUri
	};

	vowl.class = [];
	vowl.classAttribute = [];
	vowl.propertyAttribute = [];
	vowl.property = [];	

	classes.forEach(function(element) {

		vowl.class.push({
			id : element.id.toString(),
			type : element.type
		});
		var classAttribute = {
			id : element.id.toString(),
			iri : element.iri,
			label : element.label,
			instances : 0,
		};
		if (element.superClasses.length > 0 && element.type === classType) {
			classAttribute.superClasses = element.superClasses;
		}
		if (element.subClasses.length > 0 && element.type === classType) {
			classAttribute.subClasses = element.subClasses;
		}
		vowl.classAttribute.push(classAttribute);
	});

	properties.forEach(function(element) {
		if (element.range && element.domain) {
			vowl.property.push({
				id : element.id.toString(),
				type : element.type
			});
			var propertyAttribute = {
				attributes : element.attributes,
				range : element.range.toString(),
				domain : element.domain.toString(),
				id : element.id.toString(),
			};
			if (element.iri) {
				propertyAttribute.iri = element.iri;
				propertyAttribute.baseIri = rootUri;
			}
			if (element.label) {
				propertyAttribute.label = element.label;
			}

			vowl.propertyAttribute.push(propertyAttribute);
		}
	});

	return vowl;

}