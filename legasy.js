import Events from './events';
import BaseApp from 'base_app';
import Util from './utils';
import Agent from './Agent';
import Token from './Token';
import Orders from './Orders';
import Ticket from './Ticket';
import modesto from './modesto';
import Customer from './Customer';
import CallData from './CallData';
import DataUsage from './DataUsage';
import RetailFlow from './RetailFlow';
import TicketType from './TicketTypes';
import ZendeskUser from './ZendeskUser';
import CallReasons from './CallReasons';
import CTIWebsocket from './CTIWebsocket';
import TemplateManager from './TemplateManager';
import TelesalesPortalInfo from './TelesalesPortalInfo';

// var AppModule = require('ZendeskApp.js');

// Global Utils
import requests from 'globalUtils/requests';
import constants from 'globalUtils/constants';
import validator from 'globalUtils/validator';
import TokenManager from 'globalUtils/TokenManager';
import XfinityAPI from 'globalUtils/api/Xfinity/XfinityAPI';
import XMobileAPI from 'globalUtils/api/XMobile/XMobileAPI';
import ZendeskAPI from 'globalUtils/api/Zendesk/ZendeskAPI';

// add these if needed
// import Base64 from 'base64';
// import helpers from 'helpers';

var App = {

    defaultState: 'loading',

    requests: requests,
    events: Events,
    init: function() {
        // window.parent.find('#iframe_app_view_wrapper');
        Ticket.init(this);
        Util.q.init(this);
        TokenManager.init(this);
        XfinityAPI.init(this);
        XMobileAPI.init(this);
        ZendeskAPI.init(this);
        RetailFlow.init(this);
        ZendeskUser.init(this);
        CTIWebsocket.init(this);
        TokenManager.getCimaToken();
        TemplateManager.init(this);
        // this.switchTo( 'home' );
        // Clear objects
        this.endCustomerSession();
        // TemplateManager.modal();
        var fullUrl = "";
        this.store('telesales-href', fullUrl);

        // Find logged in Agent's tier
        this.agentTier();

        // Clean up Error Div
        Util.errors.hideError('#error-message, #default-error-location', this);
    },


    /// Ends Customer Session by clearing all call data and freeing up websocket to allow
    /// for next incomming CTI Message
    endCustomerSession: function() {
        CallData.endCall();
        Customer.reset();
        DataUsage.reset();
        Util.SessionStorage.clear('ticketId');
        Util.errors.hideError('#error-message, #default-error-location', this);
        var userRole = null;
        this.zafClient.get('currentUser.role').then(function(data) {
            userRole = data['currentUser.role'];
            TemplateManager.switchToDefaultTemplate(userRole);
        });
    },

    /// Loads Customer Panels
    loadCustomerPanels: function() {
        var thisObject = this;
        // var agentId = this.get( 'user.id' );
        // var fullName = Customer.getFullName();

        TemplateManager.switchToWaitingTemplate();
        thisObject.loadDataForCustomerPanels().then(() => {
            TelesalesPortalInfo.updateTelesalesHref(thisObject);
        });
    },

    /**
     * Verify a customer against the form fields (CTI verify form)
     * Once customer is verified, will display the customer info panels
     */
    verifyCustomer: () => {
        Util.errors.hideError('#error-message', this);
        var validated = validator.validate(this, "#customerVerify");
        if (!validated) {
            return false;
        }
        var thisObject = this;
        var payload = {};
        var callType = CallData.getCallReason();
        var verificationMethod;
        var txtCreditCard = $('#txtCreditCard').val() || null;
        var txtXfinityAccountNumber = $('#txtXfinityAccountNumber').val() || null;
        var txtSSN = $('#txtSSN').val() || null;
        var txtModestoAccountNumber = $('#txtModestoAccountNumber').val() || null;
        var errorMessage = "";

        if (txtCreditCard) {
            errorMessage = "Incorrect last 4 digits of credit card on file.  Please re-enter the value and try again.";
            verificationMethod = "CC";
            txtXfinityAccountNumber = Customer.getXfinityAccountNumber();

        } else if (txtXfinityAccountNumber) {

            errorMessage = "Incorrect Xfinity Account Number. Please re-enter the value and try again.";
            verificationMethod = "Xfinity";

        } else if (txtSSN) {

            errorMessage = "Incorrect last 4 SSN numbers.  Please re-enter the value and try again.";
            verificationMethod = "SSN";
            txtXfinityAccountNumber = Customer.getXfinityAccountNumber();

        } else if (txtModestoAccountNumber) {
            errorMessage = "Incorrect XFINITY Mobile Account Number. Please re-enter the value and try again.";
            verificationMethod = "Modesto";
        }

        // for telesales, do pre-check for xfinity account number
        var fullName = Customer.getFullName();
        switch (callType) {
            case CallReasons.IS_TELESALES:
                var custAddress = null;
                /// TODO: verification method should have better/more specific name (XfinityAccountNumber)
                if (verificationMethod === "Xfinity") {
                    custAddress = Customer.getServiceAddress1();
                    if (txtXfinityAccountNumber !== Customer.getXfinityAccountNumber()) {

                        Util.errors.showError(thisObject, {
                            apiErrorResponse: errorMessage,
                            location: '#error-message'
                        });
                        return;
                    }
                }

                payload = {
                    'comcastAccountNumber': txtXfinityAccountNumber,
                    'ssn': txtSSN,
                    'addressLine1': custAddress,
                    'creditCard': txtCreditCard
                };

                XfinityAPI.search.verifyCustomer(payload).then(function(response) {
                    // var xfinityAccountNumber = Customer.getXfinityAccountNumber();

                    Customer.setIsVerified(true);
                    Util.errors.hideError('#error-message', thisObject);
                    if (!response.data) {
                        Util.errors.showError(thisObject, {
                            apiErrorResponse: errorMessage,
                            location: '#error-message'
                        });
                        return false;
                    }

                    // Successfully verified
                    this.zafClient.invoke('notify','Customer ' + fullName + ' has been successfully verified.', 'notice', '6000');

                    // Load data for Telesales panels
                    this.loadDataForCustomerPanelsTelesales();

                }).fail(function(response) {
                    switch (response.status) {
                        case 400:
                            errorMessage = 'Invalid data provided';
                            break;
                    }
                    Util.errors.showError(thisObject, {
                        apiErrorResponse: errorMessage,
                        location: '#error-message'
                    });
                });
                break;
            case CallReasons.IS_VOICECARE:
                payload = {
                    'firstName': Customer.getFirstName(),
                    'lastName': Customer.getLastName(),
                    'billingAddress': Customer.getBillingAddressObject(),
                    'lastFourCN': txtCreditCard,
                    'comcastAccountNumber': txtXfinityAccountNumber,
                    'custNo': txtModestoAccountNumber
                };

                XMobileAPI.customer.verifyCustomer(payload).then(function(response) {
                    Token.saveModestoToken(response.token);
                    this.zafClient.invoke('notify', 'Customer ' + fullName + ' has been successfully verified.', 'notice', '6000');
                    var formattedZip = Util.string.formatZip(response.account.serviceAddress.zip);
                    Customer.setIsVerified(true);

                    Customer.setXfinityAccountNumber(response.account.comcastAccountNo);
                    Customer.setXfinityAccountGuid(response.account.comcastAccountGuid);
                    Customer.setModestoAccountNumber(response.account.custNo);
                    Customer.setServiceAddress(response.account.serviceAddress.address1, response.account.serviceAddress.address2);
                    Customer.setServiceCity(response.account.serviceAddress.city);
                    Customer.setServiceState(response.account.serviceAddress.state);
                    Customer.setServiceZipCode(formattedZip);

                    Customer.setModestoAccountStatus(response.account.status);
                    Customer.setModestoAccountUsers(response.account.users);

                    //Load Data customer for Voicecare panels
                    this.loadDataForCustomerPanelsVoicecare();

                }).fail(function(response) {
                    switch (response.status) {
                        case 400:
                            errorMessage = 'Invalid data provided';
                            break;
                    }
                    Util.errors.showError(thisObject, {
                        apiErrorResponse: errorMessage,
                        location: '#error-message'
                    });
                });
                break;
        }
    },

    /**
     * Bypass Customer Verificaiton for Agents that are above Tier 2
     */
    bypassCustomerVerification: function() {
        var thisObject = this;
        var payload = {};
        // var agentId = this.currentUser().id();
        var callType = CallData.getCallReason();
        var fullName = Customer.getFullName();
        var errorMessage = "Something went wrong";

        // Agent clicked Bypass Verify Button
        Agent.setClickedBypass(true);

        switch (callType) {
            case CallReasons.IS_TELESALES:

                payload = {
                    'comcastAccountNumber': Customer.getXfinityAccountNumber(),
                    'addressLine1': Customer.getServiceAddress1()
                };

                XfinityAPI.search.verifyCustomer(payload).then(function(response) {
                    // var xfinityAccountNumber = Customer.getXfinityAccountNumber();

                    Customer.setIsVerified(true);
                    Util.errors.hideError('#error-message', thisObject);
                    if (!response.data) {
                        Util.errors.showError(thisObject, {
                            location: '#error-message'
                        });
                        return false;
                    }

                    // Successfully verified
                    this.zafClient.invoke('notify', 'Customer ' + fullName + ' has been successfully verified.', 'notice', '6000');

                    // Load data for Telesales panels
                    thisObject.loadDataForCustomerPanelsTelesales();

                }).fail(function(response) {
                    // TODO : SHow error message on form here
                    switch (response.status) {
                        case 400:
                            errorMessage = 'Invalid data provided';
                            break;
                    }
                    Util.errors.showError(thisObject, {
                        apiErrorResponse: errorMessage,
                        location: '#error-message'
                    });
                });
                break;
            case CallReasons.IS_VOICECARE:
                payload = {
                    'firstName': Customer.getFirstName(),
                    'lastName': Customer.getLastName(),
                    'billingAddress': Customer.getBillingAddressObject(),
                    'comcastAccountNumber': Customer.getXfinityAccountNumber()

                };

                XMobileAPI.customer.verifyCustomer(payload).then(function(response) {
                    Token.saveModestoToken(response.token);
                    this.zafClient.invoke('notify', 'Customer ' + fullName + ' has been successfully verified.', 'notice', '6000');
                    var formattedZip = Util.string.formatZip(response.account.serviceAddress.zip);
                    Customer.setIsVerified(true);

                    Customer.setXfinityAccountNumber(response.account.comcastAccountNo);
                    Customer.setXfinityAccountGuid(response.account.comcastAccountGuid);
                    Customer.setModestoAccountNumber(response.account.custNo);
                    Customer.setServiceAddress(response.account.serviceAddress.address1, response.account.serviceAddress.address2);
                    Customer.setServiceCity(response.account.serviceAddress.city);
                    Customer.setServiceState(response.account.serviceAddress.state);
                    Customer.setServiceZipCode(formattedZip);

                    Customer.setModestoAccountStatus(response.account.status);
                    Customer.setModestoAccountUsers(response.account.users);

                    //Load Data customer for Voicecare panels
                    thisObject.loadDataForCustomerPanelsVoicecare();

                }).fail(function(response) {
                    switch (response.status) {
                        case 400:
                            errorMessage = 'Invalid data provided';
                            break;
                    }
                    Util.errors.showError(thisObject, {
                        apiErrorResponse: errorMessage,
                        location: '#error-message'
                    });
                });
                break;
        }
    },
    /**
     * Makes all the api calls to load all the data needed for the customer information panels
     * Handles all API Calls for loading Customer info panels, and display panels
     */
    loadDataForCustomerPanels: function() {
        var thisObject = this;
        var callType = CallData.getCallReason();

        switch (callType) {
            case CallReasons.IS_TELESALES:
                return thisObject.loadDataForCustomerPanelsTelesales();
            case CallReasons.IS_VOICECARE:
                /*falls through*/
            case CallReasons.IS_RETAIL:
                return thisObject.loadDataForCustomerPanelsVoicecare();
        }
    },

    /**
     * Makes the api calls to load all data needed for the telesales customer info panels
     */
    loadDataForCustomerPanelsTelesales: function() {
        var thisObject = this;
        var agentId = null;
        return this.zafClient.get('currentUser.id').then(function(data) {
            agentId = data['currentUser.id'];

            // var xfinityAccountNumber = Customer.getXfinityAccountNumber();
            var fullName = Customer.getFullName();
            var agentClickedBypass = Agent.getClickedBypass();


            TemplateManager.switchToCustomerInfoPanelsTemplateTelesales();
            var custSSN = Customer.getSSN();
            var custDOB = Customer.getDateOfBirth() ? moment(Customer.getDateOfBirth()).format('DD/MM/YYYY') : null;
            var legalCheckPayload = null;

            var promises = [
                thisObject.getXfinityCustomerDetails(Customer.getXfinityAccountGuid()),
                thisObject.getCustomerCreditCheck(Customer.getXfinityUserGuid()),
                thisObject.doModestoAuthentication(Customer.getXfinityAccountGuid())
            ];

            if (custSSN && custDOB) {
                legalCheckPayload = {
                    "comcastAccountNumber": Customer.getXfinityAccountNumber(),
                    "dob": custDOB,
                    "firstName": Customer.getFirstName(),
                    "lastName": Customer.getLastName(),
                    "ssn": custSSN
                };
                promises.push(thisObject.doLegalCheck(legalCheckPayload));

            } else {

                Customer.setIsLegal(true);

            }

            return Util.q.allSettled(promises)
                .then(() => {
                    TemplateManager.renderXfinityAuthenticationPanel();
                    TemplateManager.renderXfinityAccountDetails();
                    TemplateManager.renderTelesalesButton();
                    Customer.setDataLoaded(true);

                    if (agentClickedBypass) {
                        return;
                    } else if (thisObject.checkForExistingTicket()) {
                        ZendeskUser.saveCustomerToZendesk()
                            .then(Ticket.updateTicketFromCall)
                            .fail(function(response) {
                                switch (response.responseJSON.code) {
                                    case 404:
                                        alert('Invalid User or Agent Id');
                                        this.zafClient.invoke('notify', 'Customer ' + fullName + ' not found.', 'alert', '6000');
                                        break;
                                }
                            }).then(function() {
                                TelesalesPortalInfo.updateTelesalesHref(thisObject);
                            });
                    } else {
                        Ticket.createSkeletonTicket(CallData.getDialedNumber()).then(function(response) {
                            var ticketId = response;
                            ZendeskUser.saveCustomerToZendesk()
                                .then(Ticket.updateTicketFromCall)
                                .then(function() {
                                    Ticket.displayTicket(ticketId, agentId);

                                }).fail(function(response) {
                                    switch (response.responseJSON.code) {
                                        case 404:
                                            alert('Invalid User or Agent Id');
                                            this.zafClient.invoke('notify', 'Customer ' + fullName + ' not found.', 'alert', '6000');
                                            break;
                                    }
                                }).then(function() {
                                    TelesalesPortalInfo.updateTelesalesHref(thisObject);
                                });
                        }).fail(() => {
                            this.zafClient.invoke('notify', 'A Ticket was not generated for this call.', 'error', '6000');
                        });
                    }
                });
        });
    },

    /**
     * Calls to load panels for voicecare (still needs to be tested)
     */
    loadDataForCustomerPanelsVoicecare: function() {
        var thisObject = this;
        var agentId = null;
        return this.zafClient.get('currentUser.id').then(function(data) {
            agentId = data['currentUser.id'];

            var xMobileAccountNumber = Customer.getModestoAccountNumber();
            var xfinityAccountNumber = Customer.getXfinityAccountNumber();
            var xfinityAccountGuid = Customer.getXfinityAccountGuid();
            var fullName = Customer.getFullName();
            var agentClickedBypass = Agent.getClickedBypass();
            var lastNOrders = constants.CTIAPP.numberOfOrders;

            TemplateManager.switchToCustomerInfoPanelsTemplateVoiceCare();

            return thisObject.doModestoAuthentication(xfinityAccountGuid)
                .then(function() {
                    return thisObject.getXfinityCustomerData(xfinityAccountNumber)
                        .then(function() {
                            TemplateManager.renderCustomerContactDetailsPanel();

                            return thisObject.getModestoLines(xMobileAccountNumber)
                                .then(function() {
                                    thisObject.getWarrantyInfo();

                                    return thisObject.getModestoOrders(xMobileAccountNumber, lastNOrders)
                                        .then(function() {

                                            var custSSN = Customer.getSSN();
                                            var custDOB = Customer.getDateOfBirth() ? moment(Customer.getDateOfBirth()).format('DD/MM/YYYY') : null;
                                            var legalCheckPayload = null;

                                            var numberOfOrders = Customer.getOrderIDs();


                                            // All the API calls we need to make to get the data for the panels
                                            var promises = [
                                                thisObject.getModestoCustomerData(xMobileAccountNumber),
                                                thisObject.getModestoLinesUsage(xMobileAccountNumber),
                                                thisObject.getCustomerBillingData(xMobileAccountNumber),
                                                thisObject.getCustomerCreditCheck(Customer.getXfinityUserGuid()),
                                                thisObject.getCustomerFraudCheck(xMobileAccountNumber),
                                                thisObject.getCustomerCreditCardDetails(xMobileAccountNumber),
                                                thisObject.getRecentCustomerInteractions(xMobileAccountNumber)

                                            ];

                                            if (numberOfOrders.length == lastNOrders) {
                                                promises.push(thisObject.getModestoOrders(xMobileAccountNumber, 0));
                                            }

                                            if (custSSN && custDOB) {
                                                legalCheckPayload = {
                                                    "comcastAccountNumber": Customer.getXfinityAccountNumber(),
                                                    "dob": custDOB,
                                                    "firstName": Customer.getFirstName(),
                                                    "lastName": Customer.getLastName(),
                                                    "ssn": custSSN
                                                };
                                                promises.push(thisObject.doLegalCheck(legalCheckPayload));

                                            } else {
                                                Customer.setIsLegal(true);
                                            }

                                            Util.q.allSettled(promises)
                                                .then(() => {
                                                    Customer.setDataLoaded(true);

                                                    if (Customer.getClickedShowMore()) {
                                                        TemplateManager.renderOrderIdsTemplate();
                                                    }

                                                    TemplateManager.renderAccountBillingPanels();
                                                    TemplateManager.renderTelesalesButton();

                                                    if (agentClickedBypass) {
                                                        return;
                                                    } else if (thisObject.checkForExistingTicket()) {
                                                        ZendeskUser.saveCustomerToZendesk()
                                                            .then(Ticket.updateTicketFromCall)
                                                            .fail(function(response) {
                                                                switch (response.responseJSON.code) {
                                                                    case 404:
                                                                        alert('Invalid User or Agent Id');
                                                                        this.zafClient.invoke('notify', 'Customer ' + fullName + ' not found.', 'alert', '6000');
                                                                        break;
                                                                }
                                                            }).then(function() {
                                                                TelesalesPortalInfo.updateTelesalesHref(thisObject);
                                                            });
                                                    } else {
                                                        Ticket.createSkeletonTicket(CallData.getDialedNumber()).then(function(response) {
                                                            var ticketId = response;
                                                            ZendeskUser.saveCustomerToZendesk()
                                                                .then(Ticket.updateTicketFromCall)
                                                                .then(function() {
                                                                    Ticket.displayTicket(ticketId, agentId);
                                                                }).fail(function(response) {
                                                                    switch (response.responseJSON.code) {
                                                                        case 404:
                                                                            alert('Invalid User or Agent Id');
                                                                            this.zafClient.invoke('notify', 'Customer ' + fullName + ' not found.', 'alert', '6000');
                                                                            break;
                                                                    }
                                                                }).then(function() {
                                                                    TelesalesPortalInfo.updateTelesalesHref(thisObject);
                                                                });
                                                        }).fail(() => {
                                                            this.zafClient.invoke('notify', 'A Ticket was not generated for this call.', 'error', '6000');
                                                        });
                                                    }
                                                });
                                        });
                                });
                        });
                });
        });
    },

    /**
     * Gets Customer Data for Modesto Account, loading the Customer object
     * @param  {string} xMobileAccountNumber
     * @return {promise}                      promise of customer contacts data
     */
    getModestoCustomerData: function(xMobileAccountNumber) {
        var thisObject = this;
        return XMobileAPI.customer.getCustomerInformation(xMobileAccountNumber).then(function(response) {
            var customer = response;
            Util.SessionStorage.set('modestoCustomerInfo', JSON.stringify(customer));

            // Customer Personal Info
            var mdn = customer.userProfile.homePhone || "Not Available";
            var email = customer.userProfile.email || "Not Available";
            var ssn = customer.userProfile.last4SSN || "Not Available";
            var dob = customer.userProfile.dateOfBirth || "Not Available";

            // Customer Account Info
            var guid = customer.userProfile.guid || null;
            var accountStatus = customer.accountProfile.accountStatus || "Not Available";
            var billAddress1 = customer.billingAddress.address1 || "Not Available";
            var billAddress2 = customer.billingAddress.address2 || "";
            var billCity = customer.billingAddress.city || "";
            var billState = customer.billingAddress.state || "";
            var billZip = Util.string.formatZip(customer.billingAddress.zip) || "";

            Customer.setMDN(mdn);
            Customer.setEmail(email);
            Customer.setSSN(ssn);
            Customer.setDateOfBirth(dob);

            Customer.setXfinityAccountGuid(guid);
            Customer.setModestoAccountStatus(accountStatus);
            Customer.setBillingAddress(billAddress1, billAddress2);
            Customer.setBillingCity(billCity);
            Customer.setBillingState(billState);
            Customer.setBillingZipCode(billZip);

            TemplateManager.renderModestoAuthenticationPanel();

        }).fail(function(error) {
            var options = {
                location: '#modesto-authentication-error',
                leadingMessage: "Error in getting XFINITY Mobile customer information. ",
                apiErrorResponse: error.message,
                isPanel: true
            };
            Util.errors.showError(thisObject, options);
        });
    },

    /**
     * Gets Customer Data for Xfinity Service Account, loading the customer object
     * @param  {string} xfinityAccountNumber Account Number for customer's cable side xfinity account
     * @return {promise}                      subscription data
     */
    getXfinityCustomerData: function(xfinityAccountNumber) {
        var thisObject = this;
        return XfinityAPI.search.customerSubscriptionSearch(xfinityAccountNumber).then(function(response) {
            var customer = response.data.accountDetails;
            var guid = customer.comcastAccountGuid;
            // var users = response.data.accountDetails.users;


            modesto.setXfinityServices(customer.services);
            modesto.setXfinityPhones(customer.phoneNumbers);
            modesto.setXfinityUserData(customer.users);

            Customer.setXfinityAccountNumber(customer.comcastAccountNumber);
            CallData.setXfinityAccountNumber(customer.comcastAccountNumber);
            Customer.setXfinityAccountCreatedDate(customer.accountCreateDate);
            Customer.setXfinityAccountTenure(Util.dates.convertDaysToYears(customer.tenureInDays));
            Customer.setXfinityAccountGuid(guid);

            // If dialedNumber doesnt exist...this doesnt really make sense in the context of this func
            if (CallData.getDialedNumber() === null) {
                for (var i = 0; i < customer.phoneNumbers.length; i++) {
                    if (customer.phoneNumbers[i].type === 'HOME') {
                        CallData.setDialedNumber(customer.phoneNumbers[i].number);
                    }
                }
            }

            // Do Employee Check
            return XfinityAPI.search.getXfinityCustomerDetails(guid).then(function(response) {
                var accountDetails = response.data.accountInfo;
                var users = response.data.users;
                Customer.setIsEmployee(accountDetails.isEmployee);

                Customer.setSSN(accountDetails.ssn);

                // Get Customer Guid
                for (var i = 0; i < users.length; i++) {
                    if (users[i].role.toLowerCase() === "primary") {
                        Customer.setXfinityUserGuid(users[i].comcastUserGuid);
                        var custDob = users[i].dob || null;
                        Customer.setDateOfBirth(custDob);
                    }
                }

            }).fail(function(error) {
                var options = {
                    location: '#xfinity-details-error, #customer-contact-error',
                    leadingMessage: "Employee check failed. ",
                    apiErrorResponse: error.message,
                    isPanel: true
                };
                Util.errors.showError(thisObject, options);
            });

        }).fail(function(error) {
            var options = {
                location: '#xfinity-details-error, #customer-contact-error',
                leadingMessage: "Error in Customer Subscription Search. ",
                apiErrorResponse: error.message,
                isPanel: true
            };
            Util.errors.showError(thisObject, options);
        });
    },

    /**
     * get xfinity customer details
     * @param  {string} xfinityAccountGuid cable side customer GUID
     * @return {promise}
     */
    getXfinityCustomerDetails: function(xfinityAccountGuid) {
        var thisObject = this;
        return XfinityAPI.search.getXfinityCustomerDetails(xfinityAccountGuid).then(function(response) {
            var accountDetails = response.data.accountInfo;
            var users = response.data.users;

            Customer.setIsEmployee(accountDetails.isEmployee);
            Customer.setSSN(accountDetails.ssn);

            // Get User Guid
            for (var i = 0; i < users.length; i++) {
                if (users[i].role.toLowerCase() === "primary") {
                    Customer.setXfinityUserGuid(users[i].comcastUserGuid);

                    var custDob = users[i].dob || null;
                    Customer.setDateOfBirth(custDob);
                }
            }

        }).fail(function(error) {
            var options = {
                location: '#xfinity-authentication-error, #xfinity-account-details-error',
                leadingMessage: "Employee check failed. ",
                apiErrorResponse: error.message,
                isPanel: true
            };
            Util.errors.showError(thisObject, options);
        });
    },

    /**
     * Get data about Modesto Phone Lines and Line Usage
     * This also has orders for now until we can refactor this better
     * @param  {string} xMobileAccountNumber
     * @return {promise}
     */
    getModestoLines: function(xMobileAccountNumber) {
        var thisObject = this;
        return XMobileAPI.lineService.getLines(xMobileAccountNumber).done(function(response) {
            var linesData = response;
            modesto.setModestoLines(linesData);
            Customer.setAllLines(linesData);
            Util.SessionStorage.set("linesData", JSON.stringify(linesData));

        }).fail(function(error) {
            var options = {
                location: '#lines-data-error',
                leadingMessage: "Error in getting lines data. ",
                apiErrorResponse: error.message,
                isPanel: true
            };
            Util.errors.showError(thisObject, options);
        });
    },

    /**
     * get usage details for customers on their xMobile lines
     * @param  {string} xMobileAccountNumber
     * @return {promise}
     */
    getModestoLinesUsage: function(xMobileAccountNumber) {
        var thisObject = this;
        return XMobileAPI.lineService.getLineUsage(xMobileAccountNumber).done(function(response) {
            DataUsage.setDataUsage(response);
            TemplateManager.renderUsageDetailsPanels();
        }).fail(function(error) {
            var options = {
                location: '#usage-details-error',
                leadingMessage: "Error in getting line usage data. ",
                apiErrorResponse: error.message,
                isPanel: true
            };
            Util.errors.showError(thisObject, options);

        });
    },

    /**
     * get orders for xMobile Customers
     * @param  {string} xMobileAccountNumber
     * @param  {number} numberOfOrders       number of orders to be retrieved
     * @return {promise}
     */
    getModestoOrders: function(xMobileAccountNumber, numberOfOrders) {
        var thisObject = this;
        return XMobileAPI.order.getOrders(xMobileAccountNumber, numberOfOrders).done(function(response) {
            var ordersData = response;

            Util.SessionStorage.set("ordersData", JSON.stringify(response));
            var linesData = Customer.getAllLines();
            var partialLinesData = Customer.getLines();
            var ordersIDArray = [];
            if (ordersData && ordersData.length) {
                for (var i = 0; i < ordersData.length; i++) {
                    ordersIDArray.push(ordersData[i].id);
                }
            }
            Customer.setOrderIDs(ordersIDArray);
            Orders.setOrders(ordersData, Customer.getAllLines());

            var financedDevices = [];
            var linesIndex = 0;
            var imei;
            var linesLen = linesData.length;
            while (linesIndex < linesLen) {
                imei = linesData[linesIndex].device.deviceImei;
                if (imei) {
                    financedDevices.push(XMobileAPI.deviceFinancing.getDevice(xMobileAccountNumber, imei));
                }
                linesIndex++;
            }
            linesIndex = 1;
            // var finance = {
            //      financeMethod: "N/A"
            //  };
            Util.q.allSettled(financedDevices).then(function(array) {
                if (array.length > 0) {
                    for (var i = 0; i < array.length; i++) {
                        var finance = {
                            financeMethod: "N/A"
                        };
                        if (array[i].state === "fulfilled") {
                            var response = array[i].response;

                            // Setting Device Insurance Data for lines (XMPP)
                            for (var k = 0; k < partialLinesData.length; k++) {
                                if (partialLinesData[k].id === response.lineId) {
                                    partialLinesData[k].deviceInsurance = response.insurancePlan;
                                    if (response.insurancePlan) {
                                        partialLinesData[k].eligibleForUpgradeOn = moment(response.insurancePlan.upgradeEligibilityDate).format('MM-DD-YYYY');
                                    }
                                }
                            }
                            if (response.isFinanced === true) {
                                finance.financeMethod = "Pay Monthly";
                            } else {
                                finance.financeMethod = "Fully Paid";
                            }
                        } else if (array[i].state === "rejected") {
                            console.log(array[i].response.responseJSON.message);
                        }

                        Orders.setOrders(ordersData, Customer.getAllLines(), finance.financeMethod);
                        Customer.setLines(partialLinesData);
                    }
                }



            }).fail(() => {
                console.log("FAIL financedDevices");
            });

            // lockStatus
            var lockStatuses = [];
            var toUpdateLinesData = [];
            linesIndex = 0;
            while (linesIndex < linesLen) {
                imei = linesData[linesIndex].device.deviceImei;
                if (imei) {
                    lockStatuses.push(XfinityAPI.devices.getDeviceLockStatus(imei));
                    toUpdateLinesData.push(partialLinesData[linesIndex]);
                }
                linesIndex++;
            }
            Util.q.allSettled(lockStatuses).then(function(array) {
                if (array.length > 0) {
                    for (var i = 0; i < array.length; i++) {
                        if (array[i].state === "fulfilled") {
                            var response = array[i].response.data;
                            toUpdateLinesData[i].lockStatus = response.statusDescritpion || 'Not Available';
                        } else if (array[i].state === "rejected") {
                            console.log(array[i].response.responseJSON.error[0].message);
                        }
                    }
                    Customer.setLines(partialLinesData);
                }
                TemplateManager.renderLinesData();
            });
            TemplateManager.renderOrderIdsTemplate();
        }).fail(function(error) {
            var errorMessage = error.message;

            if (error.status == 504) {
                errorMessage = "request timed out";
            }
            var options = {
                location: '#order-details-error',
                leadingMessage: "Error in getting order data. ",
                apiErrorResponse: errorMessage,
                isPanel: true
            };
            Util.errors.showError(thisObject, options);

        });
    },

    /**
     * This function adds the warranty details to the lines object
     * @return {promise}
     */
    getWarrantyInfo: function() {
        var linesData = Customer.getLines();
        var linesIndex = -1;
        var linesLen = 0;
        if (linesData) { // Fix for this warrenty issue...needs refactoring
            linesLen = linesData.length;
        }
        var warrantyDeviceTokenReqs = [];
        var warrantyAPIArr = [];

        while (++linesIndex < linesLen) {
            var imei = linesData[linesIndex].imei;
            if (imei != "No IMEI") {
                warrantyDeviceTokenReqs.push(XfinityAPI.devices.getDeviceToken(imei));
            }
        }
        linesIndex = 1;
        var data = [];
        Util.q.allSettled(warrantyDeviceTokenReqs).then(function(array) {
            if (array.length > 0) {
                for (var i = 0; i < array.length; i++) {
                    var tokenResponse = array[i];
                    if (tokenResponse.state === "fulfilled" && tokenResponse.response.data.deviceToken) {
                        warrantyAPIArr.push(XfinityAPI.deviceWarranty.getDeviceWarranty(tokenResponse.response.data.deviceToken));
                        linesData[i].softwareVersion = tokenResponse.response.data.softwareVersion || 'Not Available';
                        data.push(linesData[i]);
                    }
                }
            }

            Util.q.allSettled(warrantyAPIArr).then(function(array) {
                var purchaseObj;
                if (array.length > 0) {
                    for (var i = 0; i < array.length; i++) {
                        var warrantyResponse = array[i];
                        purchaseObj = data[i];
                        if (warrantyResponse.state === "fulfilled") {
                            purchaseObj.warrantyData = warrantyResponse.response.data;
                            if (warrantyResponse.response.data.warrantyStatus === 'Y') {
                                purchaseObj.warrantyStatus = 'YES';
                            } else {
                                purchaseObj.warrantyStatus = 'NO';
                            }
                            purchaseObj.warrantyEndDate = moment(warrantyResponse.response.data.coverageEndDate).format('MM-DD-YYYY');
                        }
                    }
                }
            }).fail(() => {
                console.log("FAIL warrantyAPIArr");
            });
        }).fail(() => {
            console.log("FAIL warrantyDeviceTokenReqs");
        });
    },

    /**
     * Gets Modesto Data for a Customer, and checks eligibility...also sets up telesales portal query string
     * @param  {string} xfinityAccountGuid [description]
     * @return {promise}                   with JWT token as the response
     */
    doModestoAuthentication: function(xfinityAccountGuid) {
        var thisObject = this;
        return XMobileAPI.customer.onBehalfLogin('ACCOUNT_GUID', xfinityAccountGuid, true).then(function(response) {
            var formattedZip = Util.string.formatZip(response.account.serviceAddress.zip);

            TelesalesPortalInfo.setCustomerDataObject(response);
            TelesalesPortalInfo.setToken(response.token);
            Token.saveModestoToken(response.token);
            Customer.setServiceAddress(response.account.serviceAddress.address1, response.account.serviceAddress.address2);
            Customer.setServiceCity(response.account.serviceAddress.city);
            Customer.setServiceState(response.account.serviceAddress.state);
            Customer.setServiceZipCode(formattedZip);

            var users = response.account.users;

            for (var k = 0; k < users.length; k++) {
                if (users[k].role.toLowerCase() === 'primary') {
                    Customer.setXfinityUserGuid(users[k].comcastUserGuid);
                }
            }

            if (response.account.eligibility) {
                Customer.setModestoEligibility(response.account.eligibility.isEligible);
            }
            return response.token;

        }).fail(function(error) {
            var options = {
                location: '#xfinity-details-error, #customer-contact-error',
                leadingMessage: "Error in On Behalf Login. ",
                apiErrorResponse: error.message,
                isPanel: true
            };
            Util.errors.showError(thisObject, options);
        });
    },

    /**
     * Verify age based on SSN and DOB
     * @param  {object} payload payload contains SSN and DOB for the customer to be verified
     */
    doLegalCheck: function(payload) {
        return XfinityAPI.prospectCustomer.legalAgeVerificationCheck(payload)
            .then(function(response) {
                var legal = response.data;
                Customer.setIsLegal(legal);
            })
            // Set customer isLegal as true if there is an error with API.
            .fail(function() {
                Customer.setIsLegal(true);
            });

    },

    /**
     * Performs Credit Check for a customer
     * @param  {[type]} xfinityCustomerGuid [description]
     * @return {[type]}                     [description]
     */
    getCustomerCreditCheck: function(xfinityCustomerGuid) {
        var thisObject = this;
        return XfinityAPI.prospectCustomer.customerInternalCreditCheck(xfinityCustomerGuid).then(function(response) {
            var creditCheckData = response;
            Customer.setApprovedFinanceAmount(creditCheckData.data.totalFinancedAmount);
            Customer.setNumberApprovedLines(creditCheckData.data.approvedNumberOfLines);

            // Render xfinity details panel after the credit check has happened.
            TemplateManager.renderXfinityDetailsPanel();

        }).fail(function(error) {
            var options = {
                location: '#xfinity-details-error',
                leadingMessage: "Customer Credit Check Failed. ",
                apiErrorResponse: error.message,
                isPanel: true
            };
            Util.errors.showError(thisObject, options);
        });
    },

    /**
     * retrieves information for orders that are under fraud review status
     * @param  {string} xMobileAccountNumber
     * @return {promise}
     */
    getCustomerFraudCheck: function(xMobileAccountNumber) {
        // var checkFrauds = [];
        var thisObject = this;
        return XMobileAPI.order.getReviewAllOrderInformation(xMobileAccountNumber).then(function(response) {
            var orderData = response;
            var isFraud = false;
            var isFraudPending = false;
            for (var index = 0; index < orderData.length; index++) {
                var status = orderData[index].subStatus;
                if (!isFraud && status === 'FRAUD_CANCEL') {
                    isFraud = true;
                }
                if (!isFraudPending && status === 'FRAUD_MANUAL_REVIEW') {
                    isFraudPending = true;
                }
            }
            var fraudStatus = isFraud ? "Fraud Failed" : (isFraudPending ? "Pending Fraud Review" : null);
            Customer.setFraudStatus(fraudStatus);
            TemplateManager.showFraudReviewBanner();
        }).fail(function(error) {
            var apiErrorResponse = error.message;

            if (error.status == 504) {
                apiErrorResponse = 'request timed out';
            }

            Util.errors.showError(thisObject, {
                leadingMessage: "Customer Fraud Check Failed. ",
                apiErrorResponse: apiErrorResponse
            });
        });
    },

    /**
     * Gets Both Billing History and Balance Data
     * @param  {string} xMobileAccountNumber
     * @return {promise}
     */
    getCustomerBillingData: function(xMobileAccountNumber) {
        var thisObject = this;
        var billingHistory = XMobileAPI.billing.getAccountBillingHistory(xMobileAccountNumber);
        var billingBalance = XMobileAPI.billing.getAccountBillingBalance(xMobileAccountNumber);


        var promises = [billingHistory, billingBalance];
        return Util.q.all(promises).then(function(array) {
            var billingHistoryData = array[0];
            var billingBalanceData = array[1];


            // billingHistoryData = billingHistoryData[0];
            // billingBalanceData = billingBalanceData[0];


            modesto.setModestoBillingHistory(billingHistoryData);

            var currentBalance = billingBalanceData.current;
            var overdueBalance = billingBalanceData.overdue;

            Customer.setModestoAccountBalance(currentBalance);
            Customer.setModestoAccountPastDueBalance(overdueBalance);

        }, function(errorArray) {
            var options = {
                location: '#account-billing-error',
                apiErrorResponse: errorArray.message,
                leadingMessage: 'Error in getting billing data. ',
                isPanel: true
            };
            Util.errors.showError(thisObject, options);
        }).then(function() {
            XMobileAPI.billing.getLastCharge(xMobileAccountNumber)
                .then(function(response) {
                    var lastChargeData = response;
                    Customer.setModestoAccountLastCharge(lastChargeData);
                }).fail(() => {
                    console.log("Did not find last charge data");
                });
        });
    },

    /**
     * Get Credit Card information for the modesto account
     * @param  {string} xMobileAccountNumber
     * @return {promise}
     */
    getCustomerCreditCardDetails: function(xMobileAccountNumber) {
        var thisObject = this;
        return XMobileAPI.creditCard.getCCToken(xMobileAccountNumber)
            .then(function(response) {
                return XMobileAPI.creditCard.getCreditCardDetails(response.token)
                    .then(function(response) {
                        var creditCardInfo = response;

                        Customer.setModestoAccountCreditCardType(creditCardInfo.cardType);
                        Customer.setModestoAccountLastPaymentMethodCC(creditCardInfo.lastFourCN);
                        Customer.setModestoAccountLastPaymentMethodExpDate(creditCardInfo.expDate);

                    }).fail(function(error) {
                        var options = {
                            location: '#account-billing-error',
                            apiErrorResponse: error.message,
                            leadingMessage: 'Error in getting Credit Card Info. ',
                            isPanel: true
                        };
                        Util.errors.showError(thisObject, options);
                    });
            }).fail(() => {
                console.log("Credit Card Token cannot be retrieved");
            });
    },

    /**
     * @description make an API call to get tickets for the last 7 days for a customer and return only last 5
     * */
    getRecentCustomerInteractions: function(xMobileAccountNumber) {
        return Ticket.recentCustomerInteractions(xMobileAccountNumber)
            .then(function(response) {
                if (response) {
                    var ticketResponse = response;
                    var originatingChannelMap = constants.CTIAPP.originatingChannelMap;
                    var contactReasonMap = constants.CTIAPP.contactReasonMap;
                    var userPromises = [];
                    var ticketCommentsPromise = [];
                    var ticketIds = [];


                    for (var i = 0; i < response.length; i++) {
                        ticketResponse[i].originatingChannel = originatingChannelMap[ticketResponse[i].originatingChannel];
                        ticketResponse[i].contactReason = contactReasonMap[ticketResponse[i].contactReason];
                        userPromises.push(ZendeskAPI.user.showUser(ticketResponse[i].agentId));
                        ticketCommentsPromise.push(ZendeskAPI.tickets.getTicketComments(ticketResponse[i].id));
                        ticketIds.push(ticketResponse[i].id);
                    }

                    Util.q.allSettled(userPromises)
                        .then(function(responseArray) {
                            for (var j = 0; j < responseArray.length; j++) {
                                if (responseArray[j].state === 'fulfilled') {
                                    var user = responseArray[j].response.user;
                                    for (var k = 0; k < ticketResponse.length; k++) {

                                        if (ticketResponse[k].agentId == user.id) {
                                            ticketResponse[k].agentName = user.name;
                                            ticketResponse[k].salesLocationId = user.user_fields.sales_location_id;
                                        }
                                    }
                                }
                            }
                        });

                    Util.q.allSettled(ticketCommentsPromise)
                        .then(function(responseArray) {
                            for (var j = 0; j < responseArray.length; j++) {
                                if (responseArray[j].state === 'fulfilled') {
                                    var topComment = responseArray[j].response.comments[0];
                                    ticketResponse[j].comment = topComment.body;
                                } else {
                                    ticketResponse[j].comment = "Not Available";
                                }
                            }
                            TemplateManager.renderRecentInteraction(ticketResponse);
                        });


                } else {
                    TemplateManager.renderRecentInteraction();
                }
            });
    },

    /**
     * Loads the manual search fields
     */
    loadManualSearchFields: function(event) {
        var xfinityAccountNumber = event.target.id;
        var customerData = {
            'comcastAccountNumber': xfinityAccountNumber
        };

        Customer.reset();
        XMobileAPI.customer.searchCustomer(customerData).then(function(response) {
            if (response.length !== 0) {

                // Set up Customer Data
                Customer.setFirstName(response[0].userProfile.firstName);
                Customer.setLastName(response[0].userProfile.lastName);
                Customer.setMobilePhone(response[0].userProfile.contactMobilePhone);
                Customer.setHomePhone(response[0].userProfile.homePhone);
                Customer.setEmail(response[0].userProfile.email);
                Customer.setXfinityAccountNumber(response[0].userProfile.comcastAccountNo);
                Customer.setBillingAddress(response[0].billingAddress.address1, response[0].billingAddress.address2);
                Customer.setBillingAddressCity(response[0].billingAddress.city);
                Customer.setBillingState(response[0].billingAddress.state);
                Customer.setBillingState(response[0].billingAddress.zip);

                // TODO Add other fields like mdn to customer object
                // TODO: Add formatAddress function to utils

                // Populate Search Fields
                // TODO : Come up with util or some elegant way to populate this form data (handlebars?)
                $('#modAccHolderFName').val(Customer.getFirstName());
                $('#modAccHolderLName').val(Customer.getLastName());
                $('#modPhnNum').val(Customer.getMobilePhone());
                $('#modAccalterNum').val(Customer.getHomePhone());
                $('#modAccHolderEmail').val(Customer.getEmail());
                $('#modAccBillingAddLine1').val(Customer.getBillingAddress1());
                $('#modAccBillingAddLine2').val(Customer.getBillingAddress2());
                $('#citySearch').val(Customer.getBillingCity());
                $('#stateSearch').val(Customer.getBillingState());
                $('#zipSearch').val(Customer.getBillingZipCode());
                $('#xFAccNumber').val(Customer.getXfinityAccountNumber());

                //show verification section
                // AppModule.loadVerification();
                $('#modestoAccountHolderName').text(Customer.getFullName());
                $('#ModestoBillingAddress').text(Customer.getFormattedBillingAddress());

                // Show Verification Section
            }
        }).fail(function(response) {
            if (response.responseJSON.code == 404) {
                alert("Agent_id 0r User_id is invalid");
            }
            $('.alert').show();
        });
        //AppModule.loadMnSrchFields(event);
    },

    /**
     * This is executed when a websocket message (Call from IVR) is received
     * @param  {} callArgs
     */
    incomingCallHandler: function() {
        TemplateManager.switchToWaitingTemplate();
        Util.SessionStorage.clear('ticketId');
        var dialedNumber = CallData.getDialedNumber();
        var agentId = null;
        this.zafClient.get('currentUser.id').then((data) => {
            agentId = data['currentUser.id'];


            // Create Ticket
            Ticket.createSkeletonTicket(dialedNumber).then(function(response) {
                Ticket.displayTicket(response, agentId);
            }).fail(() => {
                this.zafClient.invoke('notify', 'A Ticket was not generated for this call.', 'error', '6000');
            });

            this.zafClient.trigger('ctiPop');
        });
    },

    /**
     * Perform search based on CTI Pop data
     */
    CTIPopSearch: function() {
        TemplateManager.switchToWaitingTemplate();
        Customer.reset();
        var callReason = CallData.getCallReason();
        // var callReasonString = CallData.getCallReasonString();
        // var callReasonService = CallData.getCallReasonService();
        var xfinityAccountNumber = CallData.getXfinityAccountNumber(); //|| Customer.getXfinityAccountNumber();
        var primaryUser = null;
        var thisObject = this;

        // Do Customer Search
        switch (callReason) {
            case CallReasons.IS_TELESALES:
                XfinityAPI.search.customerSubscriptionSearch(xfinityAccountNumber).then(function(response) {
                    var accountDetails = response.data.accountDetails;
                    var formattedZip;
                    // Determine Primary User
                    for (var i = 0; i < accountDetails.users.length; i++) {
                        if (accountDetails.users[i].role === "PRIMARY") {
                            primaryUser = accountDetails.users[i];
                        }
                    }

                    modesto.setXfinityPhones(accountDetails.phoneNumbers);

                    // Set up customer data
                    Customer.setFirstName(primaryUser.firstName);
                    Customer.setLastName(primaryUser.lastName);
                    Customer.setEmail(primaryUser.email);
                    Customer.setXfinityUserGuid(primaryUser.guid);

                    // MSP returns an incorrect service address line 1 & 2
                    Customer.setServiceAddress(accountDetails.serviceAddress.addressLine1, accountDetails.serviceAddress.addressLine2);
                    Customer.setServiceCity(accountDetails.serviceAddress.city);
                    Customer.setServiceState(accountDetails.serviceAddress.state);
                    if (accountDetails.serviceAddress.zip4) {
                        formattedZip = Util.string.formatZip(accountDetails.serviceAddress.zip + ' ' + accountDetails.serviceAddress.zip4);
                    } else {
                        formattedZip = Util.string.formatZip(accountDetails.serviceAddress.zip);
                    }
                    Customer.setServiceZipCode(formattedZip);
                    Customer.setXfinityAccountNumber(accountDetails.comcastAccountNumber);
                    Customer.setXfinityAccountGuid(accountDetails.comcastAccountGuid);
                    Customer.setModestoAccountNumber(accountDetails.accountId);
                    Customer.setIsVerified(false); // not yet verified

                    Customer.setCreditCardExists(accountDetails.creditCardExists);
                    Customer.setSSNExists(accountDetails.ssn4Exists);

                    modesto.setXfinityServices(accountDetails.services);
                    modesto.setXfinityPhones(accountDetails.phoneNumbers);
                    modesto.setXfinityUserData(accountDetails.users);

                    Customer.setXfinityAccountCreatedDate(accountDetails.accountCreateDate);
                    Customer.setXfinityAccountTenure(Util.dates.convertDaysToYears(accountDetails.tenureInDays));


                    // TODO ask MSP to fix addressLine1 in the response for customerSubscriptionSearch
                    var customerInfo = XfinityAPI.search.getXfinityCustomerDetails(response.data.accountDetails.comcastAccountGuid);
                    customerInfo.done(function(response) {
                        Customer.setSSN(response.data.accountInfo.ssn);

                        var users = response.data.users;

                        for (var k = 0; k < users.length; k++) {
                            if (users[k].role.toLowerCase() === 'primary') {
                                var custDob = users[k].dob || null;
                                Customer.setDateOfBirth(custDob);
                                break;
                            }
                        }
                    });

                    if (CallData.isExternallyVerified()) {
                        TemplateManager.switchToTransferredCallTemplate();
                    } else {
                        TemplateManager.switchToCTIVerifyTemplate();
                    }

                }).fail(function(error) {

                    var errorMessage = error.message;

                    switch (error.status) {
                        case 401:
                            errorMessage = "you are unauthorized to view this information.";
                            break;
                        case 500:
                            errorMessage = "something went wrong.  Please contact IT.";
                            break;
                        case 504:
                            errorMessage = "request timed out";
                            break;
                    }
                    Util.errors.showError(thisObject, {
                        leadingMessage: 'Customer subscription search failed because ',
                        apiErrorResponse: errorMessage
                    });
                });
                break;
            case CallReasons.IS_VOICECARE:
                var customerData = {
                    'comcastAccountNumber': xfinityAccountNumber
                };

                XMobileAPI.customer.searchCustomer(customerData).then(function(response) {
                    Customer.setFirstName(response[0].userProfile.firstName);
                    Customer.setLastName(response[0].userProfile.lastName);
                    Customer.setBillingAddress(response[0].billingAddress.address1, response[0].billingAddress.address2);
                    Customer.setBillingCity(response[0].billingAddress.city);
                    Customer.setBillingState(response[0].billingAddress.state);
                    Customer.setBillingZipCode(response[0].billingAddress.zip);
                    Customer.setModestoAccountNumber(response[0].customerNumber);
                    Customer.setXfinityAccountNumber(response[0].userProfile.comcastAccountNo);
                    Customer.setXfinityAccountGuid(response[0].userProfile.guid);


                    // TODO: set up extra data , figure out response
                    // TODO: SET UP CALLBACK SOLUTION
                    // TemplateManager.switchToCTIVerifyTemplate();

                    //Change template based on isExternallyVerified
                    if (CallData.isExternallyVerified()) {
                        TemplateManager.switchToTransferredCallTemplate();
                    } else {
                        TemplateManager.switchToCTIVerifyTemplate();
                    }


                }).fail(function(response) {
                    response = response.responseJSON;
                    var errorMessage = response.message;

                    switch (response.code) {
                        case 401:
                            errorMessage = "you are unauthorized to view this information.";
                            break;
                        case 404:
                            errorMessage = "this customer does not have a XFINITY Mobile Account yet.";
                            break;
                        case 405:
                            errorMessage = "some required fields were missing for this search.";
                            break;
                        case 500:
                            errorMessage = "something went wrong.  Please contact IT.";
                            break;
                        case 504:
                            errorMessage = "request timed out";
                            break;
                    }
                    Util.errors.showError(thisObject, {
                        leadingMessage: 'Customer search failed. ',
                        apiErrorResponse: errorMessage
                    });
                });
                break;
            case CallReasons.IS_RETAIL:
                RetailFlow.searchForCustomer();
                // Logic:
                // Look for modesto or xfinity linkage - if found, show verified call
                // If multiple records, show search results page
                // If neither found, show manual search form
                break;
            default:
                // alert('Invalid Call Type');
                TemplateManager.switchToGenericErrorTemplate("The call type id is invalid.");
                break;
        }
    },

    /**
     * Searches for a Customer using MSP Search API (Telesales)
     */
    setTSSearchFields: function() {
        var selection = $('#search-select-filter').val();
        this.showManualCustomerSearchForm(selection);
    },

    /**
     * Initialize customer search data model
     * @return {object} data for search object
     */
    initializeSearchObj: function() {
        return {
            'id': null,
            'allData': null,
            'firstName': "Not Available",
            'lastName': "Not Available",
            'address': "Not Available",
            'email': "Not Available",
            'phone': "Not Available",
            'xfinityAccountNumber': "Not Available",
            'modestoAccountNumber': "Not Available",
            'ssn4Exists': "Not Available",
            'creditCardExists': "Not Available",
            'telesales': true,
            'isEven': false
        };
    },

    /**
     * search customer information in the telesales flow
     */
    searchTelesales: function() {

        // Get Form Values
        var thisObj = this;
        var txtFirstName = $('#txtFirstName').val() || null;
        var txtLastName = $('#txtLastName').val() || null;
        var txtXfinityAccountNumber = $('#txtXfinityAccountNumber').val() || null;
        var txtAddress1 = $('#txtAddress1').val();
        var txtAddress2 = $('#txtAddress2').val() || null;
        var txtCity = $('#txtCity').val() || null;
        var txtState = $('#txtState').val() || null;
        var txtZip = $('#txtZip').val() || null;
        var txtXfinityPhoneNumber = $('#txtXfinityPhoneNumber').val() || null;
        if (txtXfinityPhoneNumber !== null) {
            txtXfinityPhoneNumber = Util.string.removeAllNonDigits(txtXfinityPhoneNumber);
        }
        var data, obj;

        // search using xfinity account number customers/xfinityAccountNo/subscription
        if (txtXfinityAccountNumber !== null) {
            TemplateManager.switchToWaitingTemplate();
            data = [];
            obj = thisObj.initializeSearchObj();
            XfinityAPI.search.customerSubscriptionSearch(txtXfinityAccountNumber).done(function(response) {
                //Collect data for future use

                // TEMP FIX FOR MSP BUG with invalid xfinity account number returning 200 code, no response
                if (!response) {
                    Util.errors.showError(thisObj, {
                        apiErrorResponse: 'System Error: Customer Search Failed. Please try again.'
                    });
                    return;
                }

                obj.allData = response.data;

                response = response.data.accountDetails;
                var users = response.users;




                //Collect Xfinity Home Phone number
                if ((response.phoneNumbers) && (response.phoneNumbers.length > 0)) {
                    for (var k = 0; k < response.phoneNumbers.length; k++) {
                        if (response.phoneNumbers[k].type === 'HOME') {
                            obj.phone = response.phoneNumbers[k].number;
                        }
                    }
                }

                // must we loop through users here?
                for (var i = 0; i < users.length; i++) {
                    if (users[i].role === "PRIMARY") {
                        obj.firstName = users[i].firstName;
                        obj.lastName = users[i].lastName;
                        obj.email = users[i].email;
                        obj.xfinityCustomerGuid = users[i].guid;
                    }
                }
                var formattedZip = Util.string.formatZip(response.serviceAddress.zip);

                obj.address = response.serviceAddress.addressLine1 + ', ' +
                    response.serviceAddress.city + ', ' +
                    response.serviceAddress.state + ', ' +
                    formattedZip;
                obj.billingAddress1 = response.serviceAddress.addressLine1;
                obj.billingAddress2 = "";
                obj.billingCity = response.serviceAddress.city;
                obj.billingState = response.serviceAddress.state;
                obj.billingZip = formattedZip;
                obj.xfinityAccountNumber = response.comcastAccountNumber;
                obj.xfinityAccountGuid = response.comcastAccountGuid;
                obj.modestoAccountNumber = response.accountId;
                obj.ssn4Exists = response.ssn4Exists;
                obj.creditCardExists = response.creditCardExists;
                obj.customerData = JSON.stringify(obj);
                data.push(obj);
                TemplateManager.switchToManualSearchResultsTemplate(data);

            }).fail(() => {
                Util.errors.showError(thisObj, {
                    leadingMessage: 'Customer subscription search failed. ',
                    location: '#error-message'
                });
            });
            return;
        }
        // search for anything other than xfinity account number
        var payload = {
            'name': {
                'firstName': txtFirstName,
                'lastName': txtLastName
            },
            'address': {
                'addressLine1': txtAddress1,
                'addressLine2': txtAddress2,
                'city': txtCity,
                'state': txtState,
                'zipCode': txtZip
            },
            'telephoneNumber': txtXfinityPhoneNumber
        };

        // three search parameters above go through /search
        XfinityAPI.search.customerSearch(payload).then(function(response) {
            var responseData = response.data;
            data = [];
            for (var i = 0; i < responseData.length; i++) {
                obj = thisObj.initializeSearchObj();
                var currentUserData = responseData[i];
                var formattedZip = Util.string.formatZip(currentUserData.zipCode);

                obj.address = currentUserData.postalAddress + ', ' +
                    currentUserData.city + ', ' +
                    currentUserData.state + ', ' +
                    formattedZip;
                obj.billingAddress1 = currentUserData.postalAddress;
                obj.billingAddress2 = "";
                obj.billingCity = currentUserData.city;
                obj.billingState = currentUserData.state;
                obj.billingZip = formattedZip;
                obj.firstName = currentUserData.firstName;
                obj.lastName = currentUserData.lastName;
                obj.phone = "Not Available";
                obj.isEven = (i % 2 === 0);
                obj.xfinityAccountNumber = currentUserData.accountNumber;
                obj.customerData = JSON.stringify(obj);
                data.push(obj);
            }

            TemplateManager.switchToManualSearchResultsTemplate(data);
        }).fail(function() {
            var templateData = {
                'serviceName': 'XFINITY',
                'telesales': true
            };

            thisObj.switchTo('customer-search-results', templateData);
        });
    },

    /**
     * searches for a customer using xMobile Search API
     */
    searchVoicecare: function() {
        // Get Form Values
        var thisObj = this;
        var txtFirstName = $('#txtFirstName').val() || null;
        var txtLastName = $('#txtLastName').val() || null;
        var txtXfinityAccountNumber = $('#txtXfinityAccountNumber').val() || null;
        var txtAddress1 = $('#txtAddress1').val();
        var txtAddress2 = $('#txtAddress2').val() || null;
        var txtCity = $('#txtCity').val() || null;
        var txtState = $('#txtState').val() || null;
        var txtZip = $('#txtZip').val() || null;
        var txtModestoPhoneNumber = Util.string.removeAllNonDigits($('#txtModestoPhoneNumber').val()) || null;
        var txtModestoMDN = $('#txtModestoMDN').val() || null;
        var txtEmail = $('#txtEmail').val() || null;
        var txtOrderNumber = $('#txtOrderNumber').val() || null;

        var payload = {
            'comcastAccountNumber': txtXfinityAccountNumber,
            'mdn': txtModestoMDN,
            "orderId": txtOrderNumber,
            'firstName': txtFirstName,
            'lastName': txtLastName,
            'contactPhone': txtModestoPhoneNumber,
            'email': txtEmail,
            'billingAddress': {
                'address1': txtAddress1,
                'address2': txtAddress2,
                'city': txtCity,
                'state': txtState,
                'zip': txtZip
            }
        };

        XMobileAPI.customer.searchCustomer(payload).then(function(response) {
            var data = [];
            //var userResults = [];
            for (var i = 0; i < response.length; i++) {
                var currentUserData = response[i];
                var obj = thisObj.initializeSearchObj();

                obj.id = i;
                obj.firstName = currentUserData.userProfile.firstName;
                obj.lastName = currentUserData.userProfile.lastName;
                obj.phone = currentUserData.userProfile.homePhone;
                obj.email = currentUserData.userProfile.email;
                obj.modestoAccountNumber = currentUserData.customerNumber;
                obj.xfinityAccountNumber = currentUserData.userProfile.comcastAccountNo;
                obj.billingAddress1 = currentUserData.billingAddress.address1;
                obj.billingAddress2 = currentUserData.billingAddress.address2;
                obj.billingCity = currentUserData.billingAddress.city;
                obj.billingState = currentUserData.billingAddress.state;
                obj.billingZip = Util.string.formatZip(currentUserData.billingAddress.zip);
                var formattedAddress = obj.billingAddress1 + ', ' +
                    obj.billingCity + ', ' +
                    obj.billingState + ', ' +
                    obj.billingZip;
                obj.address = formattedAddress;
                obj.isEven = (i % 2 === 0);
                obj.customerData = JSON.stringify(obj);
                data.push(obj);
            }
            TemplateManager.switchToManualSearchResultsTemplate(data);

        }).fail(function(error) {
            var errorMessage = 'Something went wrong';
            switch (error.status) {
                case 404:
                    TemplateManager.switchToManualSearchResultsTemplate([]);
                    break;
                case 500:
                    errorMessage = error.responseText;
                    break;
                default:
                    errorMessage = error.responseJSON.message;
                    break;
            }

            Util.errors.showError(thisObj, {
                leadingMessage: 'Customer search failed. ',
                apiErrorResponse: errorMessage,
                location: '#customer-search-error'
            });
        });
    },

    /**
     * Set up search based on call type
     * @return {[type]} [description]
     */
    searchForCustomer: function() {
        Util.SessionStorage.clear('ticketId');
        var validated = validator.validate(this, "#customerSearch");
        if (!validated) {
            return false;
        }

        Customer.reset();
        // var payload = null;
        var callType = CallData.getCallReason();
        // var callReasonService = CallData.getCallReasonService();

        // Set up search payload
        switch (callType) {
            case CallReasons.IS_TELESALES:
                this.searchTelesales();
                break;
            case CallReasons.IS_VOICECARE:
                this.searchVoicecare();
                break;
            case CallReasons.IS_RETAIL:
                this.searchVoicecare();
                break;
        }
    },

    /**
     * Loads Customer Profile Data In the Manual Search Results Template
     */
    loadCustomerProfile: function(event) {
        var thisObject = this;
        var callType = CallData.getCallReason();
        var defaultDiv = this.$('.div-no-data');
        var loadingDiv = this.$('.loading-div');
        var customerDiv = this.$('#selected-customer-details');
        var customerData = event.currentTarget.children[0].innerText;

        if (customerData) {
            customerData = JSON.parse(event.currentTarget.children[0].innerText);
        } else {
            customerData = {};
        }
        // Clean up Error Div
        Util.errors.hideError('#customer-guid-error', thisObject);

        //display error if customerGUID is not present
        var checkForUserGUID = function(accountDetails) {
            var userData = accountDetails.users;
            if (userData.length === 0) {
                Util.errors.showError(thisObject, {
                    apiErrorResponse: 'This customer did not create login credentials for their Account. Please direct the customer to do so.',
                    location: '#customer-guid-error'
                });
            }
        };

        if (customerData.allData !== null) {
            checkForUserGUID(customerData.allData.accountDetails);
        }

        if (customerData.modestoAccountNumber === null && callType !== CallReasons.IS_TELESALES) {
            $('#customer-details').prop("disabled", true);
        } else {
            $('#customer-details').prop("disabled", false);
        }

        var xfinityAccountNumber = customerData.xfinityAccountNumber || "Not Available";
        var fullName = customerData.firstName + ' ' + customerData.lastName || "Not Available";
        var modestoAccountNumber = customerData.modestoAccountNumber || "Not Available";
        var billingAddress = customerData.address || "Not Available";
        var email = customerData.email || "Not Available";
        var mobilePhoneNumber = customerData.phone || "Not Available";
        var xfinityAccountGuid = customerData.xfinityAccountGuid || null;

        var displayCustomerDetail = function(data) {
            // JQUERY BLEGH - couldnt figure out way for handlebars to update template without re-switching to template.
            $('#selected-customer-details #full-name').text(fullName);
            $('#selected-customer-details #email').text(email);
            $('#selected-customer-details #mobile-phone-number').text(data ? data.mobilePhoneNumber : mobilePhoneNumber);
            $('#selected-customer-details #billing-address').text(billingAddress);
            $('#selected-customer-details #modesto-account-number').text(data ? data.modestoAccountNumber : modestoAccountNumber);
            $('#selected-customer-details #xfinity-account-number').text(xfinityAccountNumber);
            $('#selected-customer-details #hidden-selected-customer-data').val(JSON.stringify(customerData));

            loadingDiv.hide();
            customerDiv.show();
        };

        defaultDiv.hide();


        // Do xfinity subscription search for telesales flow if not searched with xfinity account number
        if (mobilePhoneNumber === 'Not Available' || xfinityAccountGuid === null) {
            loadingDiv.show();
            XfinityAPI.search.customerSubscriptionSearch(xfinityAccountNumber)
                .then(function(response) {
                    var phoneNumbers = response.data.accountDetails.phoneNumbers;
                    xfinityAccountGuid = response.data.accountDetails.comcastAccountGuid;

                    if (phoneNumbers && phoneNumbers.length > 0) {
                        for (var i = 0; i < phoneNumbers.length; i++) {
                            if (phoneNumbers[i].type === 'HOME') {
                                mobilePhoneNumber = phoneNumbers[i].number;
                                customerData.phone = mobilePhoneNumber;
                            }
                        }
                    }

                    //Check if modestoAccountNumber already exists
                    if (modestoAccountNumber === 'Not Available') {
                        modestoAccountNumber = response.data.accountDetails.accountId || "Not Available";
                        customerData.modestoAccountNumber = modestoAccountNumber;
                    }

                    // Re-enable the cta button if we find modesto account number in subscription search
                    if (modestoAccountNumber !== "Not Available") {
                        $('#customer-details').prop("disabled", false);
                    }

                    var data = {
                        "modestoAccountNumber": modestoAccountNumber,
                        'mobilePhoneNumber': mobilePhoneNumber,
                        'xfinityAccountGuid': xfinityAccountGuid
                    };

                    customerData.allData = response.data;
                    displayCustomerDetail(data);
                    checkForUserGUID(response.data.accountDetails);
                });
        } else {
            displayCustomerDetail();
        }
    },

    /**
     * Selects customer profile for customer verification from the manual search results
     */
    selectCustomerProfile: function(event) {
        var thisObject = this;
        var customerData = JSON.parse(event.currentTarget.nextElementSibling.value);

        // Customer.reset();

        Customer.setFirstName(customerData.firstName);
        Customer.setLastName(customerData.lastName);
        Customer.setXfinityAccountNumber(customerData.xfinityAccountNumber);
        CallData.setXfinityAccountNumber(customerData.xfinityAccountNumber);
        Customer.setModestoAccountNumber(customerData.modestoAccountNumber);
        CallData.setDialedNumber(customerData.phone);


        var allData = customerData.accountDetails ? customerData.accountDetails : customerData.allData.accountDetails;
        if (CallData.getCallReason() === CallReasons.IS_TELESALES) {

            Customer.setServiceAddress(customerData.billingAddress1, customerData.billingAddress2);
            Customer.setServiceCity(customerData.billingCity);
            Customer.setServiceState(customerData.billingState);
            Customer.setServiceZipCode(customerData.billingZip);

            //Set all xfinty data removing the need to do subscription seach later on.
            modesto.setXfinityServices(allData.services);
            modesto.setXfinityPhones(allData.phoneNumbers);
            modesto.setXfinityUserData(allData.users);

            Customer.setCreditCardExists(allData.creditCardExists);
            Customer.setSSNExists(allData.ssn4Exists);

            Customer.setXfinityAccountCreatedDate(allData.accountCreateDate);
            Customer.setXfinityAccountTenure(Util.dates.convertDaysToYears(allData.tenureInDays));
            Customer.setXfinityAccountGuid(allData.comcastAccountGuid);

        } else {
            Customer.setBillingAddress(customerData.billingAddress1, customerData.billingAddress2);
            Customer.setBillingCity(customerData.billingCity);
            Customer.setBillingState(customerData.billingState);
            Customer.setBillingZipCode(customerData.billingZip);

            if (!Customer.getXfinityAccountGuid() && allData) {
                Customer.setXfinityAccountGuid(allData.comcastAccountGuid);

            }

        }

        if (Agent.getAgentAboveTier2()) {
            thisObject.bypassCustomerVerification();
            TemplateManager.switchToWaitingTemplate();
        } else if (CallData.isExternallyVerified()) {
            TemplateManager.switchToTransferredCallTemplate();
        } else {
            TemplateManager.switchToCTIVerifyTemplate();
        }

    },

    /// SCREEN MANIPULATORS --------------------------------------------

    /**
     * Loads the Manual Customer Search form Screen
     */
    showManualCustomerSearchForm: function(selection) {
        // var selection = $('#search-select-filter').val();
        TemplateManager.switchToManualSearchTemplate(selection);
    },

    /**
     * Sets the call flow based on selection and takes user to manual customer search flow
     * Dependent on button id in the flow template
     */
    setCallFlow: function(event) {
        var telesalesFlowId = 'buttonFlowSales';
        var voicecareFlowId = 'buttonFlowVoice';
        var flow = event.currentTarget.id;
        var selection = $('#search-select-filter').val();
        switch (flow) {
            case telesalesFlowId:
                CallData.setCallReason(CallReasons.IS_TELESALES);
                break;
            case voicecareFlowId:
                CallData.setCallReason(CallReasons.IS_VOICECARE);
                break;
        }

        TemplateManager.switchToManualSearchTemplate(selection);
    },

    /**
     * Change ticket to telesales
     */
    updateTicketToTelesales: function() {
        var currentReason = CallData.getCallReason();
        var ticketId = CallData.getGeneratedTicketId();

        if (currentReason === CallReasons.IS_VOICECARE) {
            Ticket.changeTicketType(ticketId, TicketType.TELESALES);
        }
    },

    /**
     * check for existing ticket
     */
    checkForExistingTicket: function() {
        var ticketId = CallData.getGeneratedTicketId();
        if (ticketId !== null) {
            return true;
        }
        return false;
    },

    /**
     * Toggles the Call Reason between Telesales and VoiceCare
     */
    switchCallReason: function(event) {
        var currentReason = CallData.getCallReason();

        switch (currentReason) {
            case CallReasons.IS_TELESALES:
                CallData.setCallReason(CallReasons.IS_VOICECARE);
                break;
            case CallReasons.IS_VOICECARE:
                CallData.setCallReason(CallReasons.IS_TELESALES);
                break;
        }

        // not sure if we shoudl call this here..need to find out if switching treats as new call
        // currentScreen expects parent element to have id indicating screen for the switch button
        var currentScreen = event.currentTarget.parentElement.id;
        switch (currentScreen) {
            case 'on-cti-pop':
                this.zafClient.trigger('ctiPop');
                break;
            case 'on-manual-search':
                this.zafClient.trigger('searchCustomerForm');
                break;
            default:
                this.zafClient.trigger('ctiPop');
                break;
        }
    },

    /**
     * If a caller cannot be verified, there are still some functions an agent can process
     * This function will display a ticket in the agents window
     * @return {[type]} [description]
     */
    proceedCallerUnverified: function() {
        var agentId = null;
        this.zafClient.get('currentUser.id').then(function(data) {
            agentId = data['currentUser.id'];
            var ticketId = CallData.getGeneratedTicketId();
            var thisObject = this;

            TemplateManager.switchToWaitingTemplate();
            ZendeskAPI.tickets.displayTicket(ticketId, agentId).then(() => {
                TemplateManager.switchToCallerUnverifiedTemplate();

            }).fail(() => {
                Util.errors.showError(thisObject, {
                    apiErrorResponse: "Something went wrong. Ticket does not exist."
                });
            });
        })


    },

    /**
     * Bypass Verification - Allow Tier 2, Tier 3 agents to bypass customer verificaiton process
     * Find Agent Tier on app init
     */
    agentTier: function() {

        var memberships = null;
        var membershipGroupID = null;
        var agentAboveTier2 = false;
        var groupIDs = null;
        this.zafClient.get('currentUser.groups').then((data) => {
            memberships = data['currentUser.groups'];
            groupIDs = this.setting('groupIDs');

            if (groupIDs) {
                groupIDs = groupIDs.split(',');

                Agent.resetAgentAboveTier2();

                for (var i = 0; i < memberships.length; i++) {

                    membershipGroupID = memberships[i].id.toString();

                    if (groupIDs.indexOf(membershipGroupID) !== -1) {
                        agentAboveTier2 = true;
                        Agent.setAgentAboveTier2(agentAboveTier2);
                    }
                }
            } else {
                Agent.setAgentAboveTier2(false);
            }
        });
    },

    /**
     * Open App Settings
     */
    openAppSettings: function() {
        var groups = null;
        var groupIDs = this.setting('groupIDs');

        if (groupIDs) {
            groupIDs = groupIDs.split(',');
        }

        //Get list of groups
        //pass that to template

        ZendeskAPI.user.listGroups()
            .then(function(response) {
                groups = response.groups;
                if (groupIDs) {
                    for (var i = 0; i < groups.length; i++) {
                        if (groupIDs.indexOf(groups[i].id.toString()) != -1) {
                            groups[i].checked = true;
                        }
                    }
                }
                TemplateManager.switchToAppSettingsTemplate(groups);
            });


    },

    /**
     * Update App settings
     */
    updateAppSettings: function() {
        var thisObject = this;
        var groupID = [];
        $(".groupSetting:checked").each(function() {
            groupID.push($(this).val());
        });
        groupID = groupID.toString();

        this.ajax('updateAppSettings', {
            name: thisObject.setting('title'),
            groupIDs: groupID
        }, this.installationId()).then(function() {

            this.zafClient.get('currentUser.role').then(function(data) {
                TemplateManager.switchToDefaultTemplate(data['currentUser.role']);
            })
        }).fail(() => {
            Util.errors.showError(thisObject, {
                apiErrorResponse: "Error Updating App"
            });
        });

    },

    /**
     * Switch back to the default Template
     */
    backToDefault: function() {
        this.zafClient.get('currentUser.role').then(function(data) {
            TemplateManager.switchToDefaultTemplate(data['currentUser.role']);
        })
    },

    showOrderSummary: function(event) {
        event.preventDefault();
        var orderId = event.currentTarget.innerText;
        TemplateManager.switchToOrderDetailsTemplate(orderId);
    },

    closeOrderSummary: function() {
        Orders.clearSingleOrder();

        $("#modal-container").hide();
    },

    showMoreOrders: function() {
        Customer.setClickedShowMore(true);
        TemplateManager.renderOrderIdsTemplate();
    },

    closeUsageSummary: function() {
        $("#modal-container").hide();
    },

    displayTicket: function(event) {
        var el = event.currentTarget;
        var ticketId = this.$(el).attr('ticket');
        var agentId = null;
        this.zafClient.get('currentUser.id').then(function(data) {
            agentId = data['currentUser.id'];
            Ticket.displayTicket(ticketId, agentId);
        });
    },

    interactionToggle: function(event) {
        var el = event.currentTarget;
        var ticketId = this.$(el).find('.ticket-id').attr('ticket');

        var content = this.$('#ticket-' + ticketId);
        if (content.is(':visible')) {
            content.hide();
        } else {
            content.show();



        }
    },

    lineToggle: function(event) {
        var el = event.currentTarget;
        var lineNum = $(el).attr('line');
        var ctnt = $('#content-' + lineNum);
        if (ctnt.is(':visible')) {
            ctnt.hide();
        } else {
            ctnt.show();
        }
    },

    userToggle: function(event) {
        var el = event.currentTarget;
        var content = $(el).parent().find('.content');
        if (content.is(':visible')) {
            content.hide();
        } else {
            content.show();
        }
    },

    disableOtherTextInputs: function(event) {
        Util.forms.disableAllOtherTextInputs(event, this);
    },

    inputNumbersOnly: function(event) {
        Util.forms.inputNumbersOnly(event);
    },

    /**
     * When class "positive" is added to an input, will restrict input to positive characters only
     */
    inputPostiveNumbersOnly: function(event) {
        Util.forms.inputPostiveNumbersOnly(event);
    },

    /**
     * When class "char-limit" is added to an input, will restrict input to numeric characters only
     * Also expects "char-limit-x" where x is the number of allowed characters
     */
    inputLimitChars: function(event) {
        Util.forms.inputLimitChars(event, this);
    },

    showRequiredFriendIndicator: function(event) {
        var currentElementId = event.currentTarget.id;
        if ($('#' + currentElementId).val() !== '') {
            switch (currentElementId) {
                case 'txtFirstName':
                case 'txtLastName':
                    Util.forms.showRequiredFriendsIndicator(['#txtFirstName', '#txtLastName'], this);
                    break;
                case 'txtAddress1':
                case 'txtZip':
                    Util.forms.showRequiredFriendsIndicator(['#txtAddress1', '#txtZip'], this);
                    break;
            }
        } else {
            Util.forms.hideRequiredFriendsIndicator(this);
        }
    },

    /**
     * Toggles panel inside accordian, closing all others and opening or closing clicked panel
     */
    toggleAccordianPanel: function(event) {
        var currentElement = event.currentTarget;
        var isHidden = $(currentElement).siblings('.content').is(':hidden');

        // Collapse all panels
        $('.panel-toggle').siblings('.content').hide();
        $('.panel-toggle').find('.toggle-icon').removeClass('icon-chevron-down icon-chevron-up').addClass('icon-chevron-down');

        if (isHidden === true) {
            $(currentElement).siblings('.content').show();
            $(currentElement).find('.toggle-icon').removeClass('icon-chevron-down').addClass('icon-chevron-up');
        } else {
            $(currentElement).siblings('.content').hide();
            $(currentElement).find('.toggle-icon').removeClass('icon-chevron-up').addClass('icon-chevron-down');
        }
    },

    openModestoAccountInfoModal: function() {
        TemplateManager.switchToUsageDetailsTemplate();
    },

    closeModal: function() {
        console.log('modal close');
        this.zafClient.trigger('modal.close');
        // $('#modal-container').hide();
        // $('#modal').empty();
    },

    logClosedApp: function() {
        console.log('About to close the app.');
    },

    modalRendered: function() {
        debugger;
        console.log('modalRendered');
    }

};

export default BaseApp.extend(App);


// Accountguid (orders) there? Show NewPanel
// create new panel (In both Telesales and voiceCare)
// show orderIDs
// onClick of orderIDS --> show panel --> middle panel ( DeviceNickName and DeviceType )
// Get API ( to get details about orderIDS use productskus attribute)
// cancel buttoin
