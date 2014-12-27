(function(){
	'use strict';
	angular.module('bookStoreApp').controller('HomeCtrl',  function(){
		var scp = this;

		scp.spinnerOptions = {
            radius: 40,
            lines: 7,
            length: 0,
            width: 30,
            speed: 1.7,
            corners: 1.0,
            trail: 100,
            color: '#F58A00'
        };
	})
}());