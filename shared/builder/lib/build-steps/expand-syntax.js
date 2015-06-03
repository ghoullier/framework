'use strict';

var BuildHelpers = require('./build-helpers');
var EsprimaHelpers = require('./esprima-helpers');
var PathingHelpers = require('./storage-helpers/pathing');

var PIPE = '|';

function interpolateAssetStrings(moduleName, moduleVersionRef, moduleDefinitionAST) {
    EsprimaHelpers.eachStringLiteral(moduleDefinitionAST, function(stringValue, node) {
        var fullPath;
        var moduleCDNMatch = BuildHelpers.stringToModuleCDNMatch.call(this, stringValue);
        if (moduleCDNMatch) {
            var assetModuleName = moduleCDNMatch.value.split(PIPE)[1] || moduleName;
            fullPath = PathingHelpers.buildAssetURL.call(this, assetModuleName, moduleVersionRef, '');
            node.value = stringValue.split(moduleCDNMatch.match).join(fullPath);
        }
        else {
            var matches = 0;
            BuildHelpers.eachAssetStringMatchInString.call(this, stringValue, function(match, replaced) {
                fullPath = PathingHelpers.buildAssetURL.call(this, moduleName, moduleVersionRef, replaced);
                stringValue = stringValue.split(match).join(fullPath);
                matches++;
            }.bind(this));
            if (matches > 0) {
                node.value = stringValue;
            }
        }
    }.bind(this));
}

function expandBehaviorsObject(behaviorsAST) {
    EsprimaHelpers.eachObjectProperty(behaviorsAST, function(_0, _1, _2, valueObj) {
        EsprimaHelpers.eachObjectProperty(valueObj, function(keyName, _1, subValueVal, subValueObj, eventProp) {
            if (EsprimaHelpers.isStringLiteral(subValueObj) && subValueVal.match(this.options.behaviorSetterRegex)) {
                eventProp.value = buildFunctionAST(keyName, subValueVal, behaviorFnStringTemplate);
            }
        }.bind(this));
    }.bind(this));
}

function behaviorFnStringTemplate(stateName) {
    return '(function(' + stateName + '){ return ' + stateName + '; })';
}

function eventFnStringTemplate(stateName) {
    return '(function($state,$payload){$state.set(\'' + stateName + '\',$payload);})';
}

var FUNCTION_FILTERS = {};
// Camel-case the given hyphen-separated string
FUNCTION_FILTERS.camel = function(str) {
    return str.replace(/-([a-z])/g, function(g) {
        return g[1].toUpperCase();
    });
};
// Alias
FUNCTION_FILTERS['camel-case'] = FUNCTION_FILTERS.camel;

function allEventFunctionFilters(key, filters) {
    for (var i = 0; i < filters.length; i++) {
        var filter = filters[i];
        if (FUNCTION_FILTERS[filter]) {
            key = FUNCTION_FILTERS[filter](key);
        }
    }
    return key;
}

function buildFunctionAST(key, value, fnStringTemplate) {
    if (value[0] !== '[' && value[1] !== '[') {
        // Warn developer and correct syntax for backward compatibility
        console.warn('Please use the correct shorthand syntax for ' + key + ' denoted by double brackets. [[' + value + ']] rather than ' + value);
        value = '[[' + value + ']]';
    }

    var subValueVal = value.substr(2, value.length - 4); // Remove brackets
    var functionParts = subValueVal.split(PIPE);
    var functionKey = functionParts[0];
    var filters = functionParts.slice(1, functionParts.length);

    var stateName;
    var fnString;
    var body;

    switch (functionKey) {
        case 'setter':
            stateName = allEventFunctionFilters(key, filters);
            fnString = fnStringTemplate(stateName);
            body = EsprimaHelpers.parse(fnString).body[0];
            return body.expression;
        case 'identity':
            stateName = filters.splice(-1); // 'identity|myContent'
            stateName = allEventFunctionFilters(stateName, filters);
            fnString = behaviorFnStringTemplate(stateName);
            body = EsprimaHelpers.parse(fnString).body[0];
            return body.expression;
        default:
            throw new Error('`' + functionKey + '` is not a valid value for an event.');
    }
}

function expandEventsObject(eventsAST) {
    EsprimaHelpers.eachObjectProperty(eventsAST, function(keyName, _1, valueVal, valueObj, eventProp) {
        if (EsprimaHelpers.isLiteral(valueObj)) {
            // Whitelist of event string values are processed on client
            if (!(valueVal in this.options.reservedEventValues)) {
                eventProp.value = buildFunctionAST(keyName, valueVal, eventFnStringTemplate);
            }
        }
        else if (EsprimaHelpers.isObjectExpression(valueObj)) {
            if (keyName !== this.options.passThroughKey) {
                expandEventsObject.call(this, valueObj);
            }
        }
    }.bind(this));
}

function processSyntacticalSugar(moduleName, moduleDefinitionAST, moduleConfigAST) {
    EsprimaHelpers.eachObjectProperty(moduleDefinitionAST, function(facetName, _1, _2, valueObj) {
        if (facetName === this.options.behaviorsFacetKeyName) {
            expandBehaviorsObject.call(this, valueObj);
        }
        else if (facetName === this.options.eventsFacetKeyName) {
            expandEventsObject.call(this, valueObj);
        }
    }.bind(this));
}

function addVersionRefToLibraryInvocation(versionRef, libraryInvocation) {
    if (libraryInvocation.arguments) {
        // Make the version ref the second argument to BEST.scene(...)
        // since the client-side uses the ref internally for managing objects
        var versionRefArgAST = EsprimaHelpers.buildStringLiteralAST(versionRef);
        libraryInvocation.arguments[2] = libraryInvocation.arguments[1];
        libraryInvocation.arguments[1] = versionRefArgAST;
    }
}

function expandSyntax(info, cb) {
    var moduleName;
    for (moduleName in info.moduleDefinitionASTs) {
        var moduleDefinitionAST = info.moduleDefinitionASTs[moduleName];
        var moduleConfigAST = info.moduleConfigASTs[moduleName];
        interpolateAssetStrings.call(this, moduleName, info.versionRef, moduleDefinitionAST);
        processSyntacticalSugar.call(this, moduleName, moduleDefinitionAST, moduleConfigAST);
    }
    for (moduleName in info.libraryInvocations) {
        var libraryInvocation = info.libraryInvocations[moduleName];
        addVersionRefToLibraryInvocation.call(this, info.versionRef, libraryInvocation);
    }
    cb(null, info);
}

module.exports = expandSyntax;
