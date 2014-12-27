(function(){
	'use strict';
	angular.module('commonServices').factory('bookService',  function($resource){
		return $resource('http://hkapi.herokuapp.com/mybooks/:bookId',{bookId:'@bookId'});
		
	})
}());