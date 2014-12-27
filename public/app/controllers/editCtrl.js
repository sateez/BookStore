(function(){
	'use strict';
	
	angular.module('bookStoreApp').controller('EditCtrl',function($state,books,book){
		console.log(this);
		var scp = this;
		console.log(book);
		if(book === undefined){
			console.log('new instance');
		scp.book=new books();
		
	}
	else{
		console.log('no new instance created');
		scp.book = book;
	}
		console.log(scp.book);
		scp.add=function(isValid){
			console.log('in add',isValid);
			if(isValid){
				console.log(scp.book);
				scp.book.$save(function(data){
					toastr.success('added succesfully');
					$state.go('home');
				})
			}
			
		}
	})

}());