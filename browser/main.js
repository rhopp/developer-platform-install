'use strict';

import angular from 'angular';
import uiRouter from 'angular-ui-router';

import acctCtrl from './pages/account/controller';
import confCtrl from './pages/confirm/controller';
import instCtrl from './pages/install/controller';
import startCtrl from './pages/start/controller';
import progressBar from './directives/progressBar.js';
import InstallerDataService from './services/data';
import VirtualBoxInstall from './model/virtualbox';
import JdkInstall from './model/jdk-install';

let env = require('remote').require('../main/env');

let mainModule =
      angular.module('devPlatInstaller', ['ui.router'])
          .controller(acctCtrl.name, acctCtrl)
          .controller(confCtrl.name, confCtrl)
          .controller(instCtrl.name, instCtrl)
          .controller(startCtrl.name, startCtrl)
          .factory('installerDataSvc', InstallerDataService.factory)
          .directive(progressBar.name, progressBar)
          .config( ["$stateProvider", "$urlRouterProvider", ($stateProvider, $urlRouterProvider) => {
            $urlRouterProvider.otherwise('/account');

            $stateProvider
              .state('account', {
                url: '/account',
                controller: 'AccountController as acctCtrl',
                templateUrl: 'pages/account/account.html'
              })
              .state('confirm', {
                url: '/confirm',
                controller: 'ConfirmController as confCtrl',
                templateUrl: 'pages/confirm/confirm.html'
              })
              .state('install', {
                url: '/install',
                controller: 'InstallController as instCtrl',
                templateUrl: 'pages/install/install.html'
              })
              .state('start', {
                url: '/start',
                controller: 'StartController as startCtrl',
                templateUrl: 'pages/start/start.html'
              });
          }])
          .run( ['$rootScope', '$location', 'installerDataSvc', ($rootScope, $location, installerDataSvc) => {
            installerDataSvc.addItemToInstall(
                'virtualbox',
                new VirtualBoxInstall('5.0.8',
                                      '103449',
                                      env.installRoot(),
                                      env.tempDir(),
                                      'http://download.virtualbox.org/virtualbox/${version}/VirtualBox-${version}-${revision}-Win.exe',
                                      null)
            );

            installerDataSvc.addItemToInstall(
                'jdk',
                new JdkInstall(env.installRoot(),
                               env.tempDir(),
                               'http://cdn.azulsystems.com/zulu/bin/zulu1.8.0_66-8.11.0.1-win64.zip',
                               null)
            );
          }]);

export default mainModule;