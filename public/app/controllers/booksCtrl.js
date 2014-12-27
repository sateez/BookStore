(function(){
	'use strict';
	angular.module('bookStoreApp').controller('BooksCtrl',  function(bookService,$state,$window){
		var scp = this;
		scp.lists = bookService.query();
		
		scp.deleteBook = function(book1){			
		   console.log('delete funciton',book1);
		   if($window.confirm('DELETE?')){
		 		bookService.delete({bookId:book1.id},function(data){
		 			toastr.error('bookdeleted');
		 			$state.reload();
		 		})
		 	}
		 		
		 

		    
		} 
	})
}());