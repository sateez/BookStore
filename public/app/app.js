(function(){
	'use strict';
	var app = angular.module('bookStoreApp',['ngResource','ngMessages','ngAnimate','ui.router','commonServices']);

	toastr.options.positionClass='toast-bottom-right';
	toastr.options.timeOut = 3000;

	app.config(function($stateProvider,$urlRouterProvider){
		$urlRouterProvider.otherwise('home');

		$stateProvider.state('home',{
			url:'/',
			templateUrl:'app/views/home.html',
			controller:'HomeCtrl as scp'
		}).state('books',{
			url:'/books',
			templateUrl:'app/views/books.html',
			controller:'BooksCtrl as scp'

		}).state('editbook',{
			url:'/book/edit/:bookId',
			templateUrl:'app/views/editbook.html',
			controller:'EditCtrl as scp',
			resolve:{
						books:'bookService',
						book:function(books,$stateParams){
							
							var bookId = $stateParams.bookId  ;
							if(bookId!=0)
							return books.get({bookId:bookId}).$promise;
						
						}
			}
		}).state('editbook.add',{
				url:'/add',
				templateUrl:'app/views/editbook.html'
			}).state('bookInfo',{
			
			url:'/books/:bookId',
			templateUrl:'app/views/bookInfo.html',
			controller:'BookCtrl as scp',
			resolve:{
						books:'bookService',
						book:function(bookService,$stateParams){
							var bookId = $stateParams.bookId;
							return bookService.get({bookId:bookId}).$promise;
						}
			}
		})
	})

}());