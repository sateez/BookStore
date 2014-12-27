(function(){
	'use strict';
	angular.module('bookStoreApp').controller('BookCtrl',function(books,book){
		var scp = this;
		scp.book = book;
		console.log(scp.book);
	})
}());