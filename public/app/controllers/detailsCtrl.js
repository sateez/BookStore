(function(){
	'use strict';

	angular.module('bookStoreApp').controller('DetailsCtrl',  function($scope,book){
		var scp = this;
		
		$scope.book1 = book; 
		console.log($scope.book1);
	});
}());