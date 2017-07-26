/// Template Management Functions
/// Every Switch To should call popover as well to size appropriately
/// Every template requiring data should set up the template data json object
import Util from './utils';
import Agent from './Agent';
import Orders from './Orders';
import CallData from './CallData';
import Customer from './Customer';
import DataUsage from './DataUsage';
import CallReasons from './CallReasons';
import StatusCodes from './StatusCodes';
import constants from 'globalUtils/constants';
var client = null;
module.exports = {


    init: function(zdAppObject) {
        client = zdAppObject;

    },

    modal: function() {
        return client.zafClient.invoke('instances.create', {
            location: 'modal',
            url: 'assets/modal.html'
        });

    },

    // Assumes CallData.callReason is set as well as name, home phone, and billing/service address for customer
    // Todo: checks for required data
    switchToCTIVerifyTemplate: function(isError) {


        var callReason = CallData.getCallReason();
        var callReasonString = CallData.getCallReasonString();
        var callReasonService = CallData.getCallReasonService();
        var formattedAddress = (callReason === CallReasons.IS_VOICECARE ? Customer.getFormattedBillingAddress() : Customer.getFormattedServiceAddress());
        var isTelesales = (callReason === CallReasons.IS_TELESALES);
        var isVoiceCare = (callReason === CallReasons.IS_VOICECARE);
        var isTelesalesCCExists = ((isTelesales && Customer.creditCardExists()) || isVoiceCare);
        var ssnExists = Customer.ssnExists();
        var switchToService = (isTelesales ? 'Voice Care' : 'Telesales');
        var agentAboveTier2 = Agent.getAgentAboveTier2();

        var templateData = {
            'isError': isError,
            'voicecare': isVoiceCare,
            'telesales': isTelesales,
            'telesalesCCExists': isTelesalesCCExists,
            'ssnExists': ssnExists,
            'switchToService': switchToService,
            'callType': callReasonString,
            'serviceName': callReasonService,
            'agentAboveTier2': agentAboveTier2,
            'customer': {
                'name': Customer.getFullName(),
                'phone': Customer.getXfinityHomePhones(),
                'serviceAddress': formattedAddress,
                'xfinityAccountNumber': Customer.getXfinityAccountNumber()
            }
        };
        client.switchTo('cti-verify', templateData);
        client.zafClient.invoke('popover', {
            width: 1200,
            height: 750
        });
        client.zafClient.invoke('resize', {
            width: 1200,
            height: 750
        });
    },

    /// Displays the screen to be shown when agent receives a transfered call
    /// @return: void
    switchToTransferredCallTemplate: function() {

        var callReason = CallData.getCallReason();
        var formattedAddress = (((callReason === CallReasons.IS_VOICECARE) || (callReason === CallReasons.IS_RETAIL)) ? Customer.getFormattedBillingAddress() : Customer.getFormattedServiceAddress());
        var isTS = (callReason === CallReasons.IS_TELESALES);
        var templateData = {
            'customer': {
                'name': Customer.getFullName(),
                'phone': Customer.getXfinityHomePhones(),
                'serviceAddress': formattedAddress,
                'isTelesales': isTS
            }
        };

        client.switchTo('cti-transfer', templateData);
        client.zafClient.invoke('popover', {
            width: 1200,
            height: 800
        });
        client.zafClient.invoke('resize', {
            width: 1200,
            height: 800
        });
    },

    switchToCustomerInfoPanelsTemplateVoiceCare: function() {
        var templateData = {
            'voicecare': true,
            'fraudStatus': Customer.getFraudStatus(),
            'fraudStatusClass': Customer.getFraudStatus() === 'Fraud Failed' ? "bad" : "warn",
            'customer': {
                'firstName': Customer.getFirstName(),
                'lastName': Customer.getLastName(),
                'isEmployee': Customer.isEmployee()
            }
        };

        client.switchTo('customer-information-panels', templateData);

        if (!Customer.getDataLoaded()) {
            var template = client.renderTemplate('waiting');
            $('.loading-class').html(template);
            $('.panel-toggle').find('.toggle-icon').removeClass('icon-chevron-down icon-chevron-up').addClass('spinner dotted');
        }

        client.zafClient.invoke('popover', {
            width: 400,
            height: 750
        });
        client.zafClient.invoke('resize', {
            width: 400,
            height: 750
        });

        // Show an alert if the customer only has xfinity mobile services from comcast
        if (Customer.hasOnlyXfinityMobileService()) {
            this.switchToGenericAlertTemplate("This customer has disconnected all their XFINITY residential services. They are still able to maintain their account but they cannot add a new line of service. New device purchases must be paid in full.");
        }
    },

    switchToCustomerInfoPanelsTemplateTelesales: function() {
        var templateData = {
            'telesales': true
        };

        client.switchTo('customer-information-panels', templateData);

        if (!Customer.getDataLoaded()) {
            var template = client.renderTemplate('waiting');
            $('.loading-class').html(template);
            $('.panel-toggle').find('.toggle-icon').removeClass('icon-chevron-down icon-chevron-up').addClass('spinner dotted');
        }

        if (Customer.getDataLoaded()) {
            this.renderXfinityAuthenticationPanel();
            this.renderXfinityAccountDetails();
            this.renderTelesalesButton();
        }

        client.zafClient.invoke('popover', {
            width: 350,
            height: 750
        });
        client.zafClient.invoke('resize', {
            width: 350,
            height: 750
        });


        // Show an alert if the customer only has xfinity mobile services from comcast
        // TODO: copy / messages util / constants
        if (Customer.hasOnlyXfinityMobileService()) {
            this.switchToGenericAlertTemplate("This customer has disconnected all their XFINITY residential services. They are still able to maintain their account but they cannot add a new line of service. New device purchases must be paid in full.");
        }
    },

    // Render Xfinity authenticaton Panel Data
    renderXfinityAuthenticationPanel: function() {
        var templateData = {
            'customer': {
                'firstName': Customer.getFirstName(),
                'lastName': Customer.getLastName(),
                'email': Customer.getEmail(),
                'homePhone': Customer.getXfinityHomePhones(),
                'workPhone': Customer.getXfinityWorkPhones(),
                'serviceAddress': {
                    'address1': Customer.getServiceAddress1(),
                    'address2': Customer.getServiceAddress2(),
                    'city': Customer.getServiceCity(),
                    'state': Customer.getServiceState(),
                    'zipCode': Customer.getServiceZipCode()
                },
                'xfinityAccountNumber': Customer.getXfinityAccountNumber(),
                'isEligibleForModesto': Customer.isEligibleForModesto(),
                'isLegal': Customer.getIsLegal(),
                'credit': {
                    'approvedFinancialAmount': Customer.getApprovedFinanceAmount(),
                    'approvedLines': Customer.getNumberApprovedLines()
                }
            }
        };

        $('#panel-xfinity-authentication').find('.toggle-icon').removeClass('spinner dotted').addClass('icon-chevron-down');
        var template = client.renderTemplate('xfinity-authentication', templateData);
        $('#xfinity-authentication-content').html(template);
    },

    //Render xfinity account details panel
    renderXfinityAccountDetails: function() {
        var templateData = {
            'xfinityAccountNumber': Customer.getXfinityAccountNumber(),
            'xfinityAccount': {
                'isActive': Customer.isXfinityAccountActive(),
                'createdDate': Customer.getXfinityAccountCreatedDate(),
                'tenure': Customer.getXfinityAccountTenure(),
                'activeServices': Customer.getXfinityAccountActiveServices().join(', '),
                'inactiveServices': Customer.getXfinityAccountInactiveServices().join(', '),
                'users': Customer.getXfinityAccountUsers()
            }
        };

        $('#panel-xfinity-account').find('.toggle-icon').removeClass('spinner dotted').addClass('icon-chevron-down');
        var template = client.renderTemplate('xfinity-account-details', templateData);
        $('#xfinity-account-details-content').html(template);
    },

    // Render Modesto Authentication Panel Data
    renderModestoAuthenticationPanel: function() {
        var templateData = {
            'customer': {
                'firstName': Customer.getFirstName(),
                'lastName': Customer.getLastName(),
                'homePhone': Util.string.formatPhoneNumber(Customer.getMDN()),
                'email': Customer.getEmail(),
                'modestoAccountNumber': Customer.getModestoAccountNumber(),
                'xfinityAccountNumber': Customer.getXfinityAccountNumber(),
                'isEligibleForModesto': Customer.isEligibleForModesto(),
                'isLegal': Customer.getIsLegal(),
                'formattedServiceAddress': Customer.getFormattedServiceAddress()
            }
        };
        $('#panel-modesto-authentication').find('.toggle-icon').removeClass('spinner dotted').addClass('icon-chevron-down');

        var template = client.renderTemplate('modesto-authentication', templateData);
        $('#modesto-authentication-content').html(template);

    },

    /**
     * @description Renders data for the recent customer interaction
     * */
    renderRecentInteraction: function(tickets) {
        var templateData = {};
        var template = '<p>No COE interactions within the past 7 days.</p>';
        $('#panel-recent-interactions').find('.toggle-icon').removeClass('spinner dotted').addClass('icon-chevron-down');
        if (tickets && tickets.length > 0) {
            templateData = {
                'ticket': tickets
            };
            $('#panel-recent-interactions').find('h2').addClass('inactiveIndicator');

            template = client.renderTemplate('recent-interactions', templateData);
            $('#recent-interactions-content').html(template);
        } else {
            $('#recent-interactions-content').html(template);
        }


    },

    // Render Wireless Details panel - lines data
    renderLinesData: function() {
        var templateData = {
            'lines': Customer.getLines(),
            'customer': {
                'firstName': Customer.getFirstName(),
                'lastName': Customer.getLastName(),
                'onlyModesto': (!Customer.isXfinityAccountActive()),
                'modestoAccount': {
                    'status': StatusCodes.getStatusCodeTranslation(Customer.getModestoAccountStatus(), 'account')
                }
            }
        };

        var template = client.renderTemplate('lines-data', templateData);
        $('#lines-data-content').html(template);
    },

    // Render Wireless Details panel - orders data
    renderOrderIdsTemplate: function() {

        var notAllDataLoaded = false;
        var showMoreNotClicked = true;

        if (Customer.getClickedShowMore() && !Customer.getDataLoaded()) {
            notAllDataLoaded = true;
            showMoreNotClicked = false;
        }

        if (Customer.getClickedShowMore() && Customer.getDataLoaded()) {
            notAllDataLoaded = false;
            showMoreNotClicked = !Customer.getClickedShowMore();
        }

        var orderIdsTemplateData = {
            'orders': Customer.getOrderIDs(),
            'showMoreNotClicked': showMoreNotClicked,
            'notAllDataLoaded': notAllDataLoaded
        };

        $('#panel-modesto-wireless-details').find('.toggle-icon').removeClass('spinner dotted').addClass('icon-chevron-down');
        var template = client.renderTemplate('order-ids', orderIdsTemplateData);
        $('#order-details-content').html(template);
    },

    // Render xfinity details panel data
    renderXfinityDetailsPanel: function() {
        var ilcApprovedFinanceAmount = Customer.getApprovedFinanceAmount() || "Not Available";
        var ilcApprovedNumberOfLines = Customer.getNumberApprovedLines() || "Not Available";

        var templateData = {
            'customer': {
                'firstName': Customer.getFirstName(),
                'lastName': Customer.getLastName(),
                'email': Customer.getEmail(),
                'xfinityAccountNumber': Customer.getXfinityAccountNumber(),
                'credit': {
                    'approvedFinancialAmount': ilcApprovedFinanceAmount,
                    'approvedLines': ilcApprovedNumberOfLines
                },
                'xfinityAccount': {
                    'isActive': Customer.isXfinityAccountActive(),
                    'activeServices': Customer.getXfinityAccountActiveServices().join(', '),
                    'inactiveServices': Customer.getXfinityAccountInactiveServices().join(', '),
                    'createdDate': Customer.getXfinityAccountCreatedDate(),
                    'tenure': Customer.getXfinityAccountTenure(),
                    'users': Customer.getXfinityAccountUsers(),
                    'homePhone': Customer.getXfinityHomePhones(),
                    'workPhone': Customer.getXfinityWorkPhones()
                }
            }
        };
        $('#panel-xfinity-service-account-details').find('.toggle-icon').removeClass('spinner dotted').addClass('icon-chevron-down');
        var template = client.renderTemplate('xfinity-details', templateData);
        $('#xfinity-details-content').html(template);
    },

    // Render Modesto Account Billing Details Panels
    renderAccountBillingPanels: function() {
        var templateData = {
            'modestoAccount': {
                'balance': Customer.getModestoAccountBalance() ? ('$' + Customer.getModestoAccountBalance()) : 'Not Available',
                'pastDueAmount': Customer.getModestoAccountPastDueBalance() ? ('$' + Customer.getModestoAccountPastDueBalance()) : 'Not Available',
                'pastDueDate': Util.dates.formatDateYYYYMMddTHHmmSSToYYYYMMdd(Customer.getModestoAccountPastDueDate()) || 'Not Available',
                'lastPaymentAmount': Customer.getModestoAccountLastPaymentAmount() ? ('$' + Customer.getModestoAccountLastPaymentAmount()) : 'Not Available',
                'lastPaymentDate': Util.dates.formatDateYYYYMMddTHHmmSSToYYYYMMdd(Customer.getModestoAccountLastPaymentDate()) || 'Not Available',
                'billCycleEndDate': Util.dates.formatDateYYYYMMddTHHmmSSToYYYYMMdd(Customer.getModestoAccountBillCycleEndDate()) || 'Not Available',
                'cardType': Customer.getModestoAccountCreditCardType() || 'Not Available',
                'lastFourCC': Customer.getModestoAccountLastPaymentMethodCC() || 'Not Available',
                'ccExpDate': Customer.getModestoAccountLastPaymentMethodExpDate() || 'Not Available',
                'lastCharge': Customer.getModestoAccountLastCharge() || 'Not Available',
                'hasBillingHistory': Customer.getHasBillingHistory() || 'Not Available',
                'billingAddress': Customer.getFormattedBillingAddress() || 'Not Available'
            }
        };
        $('#panel-modesto-billing-details').find('.toggle-icon').removeClass('spinner dotted').addClass('icon-chevron-down');
        var template = client.renderTemplate('account-billing', templateData);
        $('#account-billing-content').html(template);
    },

    // Render Usage Details Panels
    renderUsageDetailsPanels: function() {
        var templateData = {
            'dataUsage': {
                'currentMonth': DataUsage.getSummaryUsage(),
                'previousMonth': null,
                'twoMonthsAgo': null,
                'lines': []
            }
        };
        $('#panel-usage-details').find('.toggle-icon').removeClass('spinner dotted').addClass('icon-chevron-down');
        var template = client.renderTemplate('usage-details', templateData);
        $('#usage-details-content').html(template);
    },

    // Render Customer Contact Details Panel
    renderCustomerContactDetailsPanel: function() {
        var templateData = {
            'firstName': Customer.getFirstName(),
            'lastName': Customer.getLastName(),
            'serviceAddress': {
                'address1': Customer.getServiceAddress1(),
                'address2': Customer.getServiceAddress2(),
                'city': Customer.getServiceCity(),
                'state': Customer.getServiceState(),
                'zipCode': Customer.getServiceZipCode()
            },
            'homePhone': Customer.getXfinityHomePhones(),
            'workPhone': Customer.getXfinityWorkPhones()
        };

        $('#panel-customer-contact-details').find('.toggle-icon').removeClass('spinner dotted').addClass('icon-chevron-down');
        var template = client.renderTemplate('customer-contact-details', templateData);
        $('#customer-contact-content').html(template);
    },

    // Render Telesales Button
    renderTelesalesButton: function() {
        var templateData = {
            'isLegal': Customer.getIsLegal()
        };
        var template = client.renderTemplate('telesales-button', templateData);
        $('#telesales-button').html(template);
    },

    // Caller Unverified
    switchToCallerUnverifiedTemplate: function() {
        client.switchTo('caller-unverified');
        client.zafClient.invoke('popover', {
            width: 360,
            height: 200
        });
        client.zafClient.invoke('resize', {
            width: 360,
            height: 200
        });
    },

    // Manual Search Form
    switchToManualSearchTemplate: function(searchType) {
        var callReason = CallData.getCallReason();

        if (callReason === null) {
            this.switchToFlowSelectTemplate();
            return;
        }

        var callReasonString = CallData.getCallReasonString();
        // var callReasonService = CallData.getCallReasonService();

        var isTelesales = (callReason == CallReasons.IS_TELESALES);
        var isVoicecare = (callReason == CallReasons.IS_VOICECARE) || (callReason == CallReasons.IS_RETAIL);
        var switchTo = (isTelesales ? 'Voice Care' : 'Telesales');
        var states = constants.STATES;

        var templateData = {
            'telesales': isTelesales,
            'voicecare': isVoicecare,
            'switchToService': switchTo,
            'callType': callReasonString,
            'firstNameLastName': false,
            'xfinityPhoneNumber': false,
            'xfinityServiceAddress': false,
            'xfinityAccountNumber': false,
            'states': states
        };

        switch (searchType) {
            case 'firstNameLastName':
                templateData.firstNameLastName = true;
                break;
            case 'xfinityPhoneNumber':
                templateData.xfinityPhoneNumber = true;
                break;
            case 'xfinityServiceAddress':
                templateData.xfinityServiceAddress = true;
                break;
            case 'xfinityAccountNumber':
                templateData.xfinityAccountNumber = true;
                break;
            default:
                templateData.firstNameLastName = true;

        }

        client.switchTo('customer-search', templateData);

        if (switchTo === 'Voice Care') {
            client.zafClient.invoke('popover', {
                width: 600,
                height: 600
            });
            client.zafClient.invoke('resize', {
                width: 600,
                height: 600
            });
        } else {
            client.zafClient.invoke('popover', {
                width: 1200,
                height: 600
            });
            client.zafClient.invoke('resize', {
                width: 1200,
                height: 600
            });
        }
    },

    /// Search Results Template
    ///@searchResultsData: Array of JSON objects with the following keys:
    /// fullName, address, isEven,modestoAccountNumber, customerData, id
    /// customerData is a json object with the following keys:
    /// firstName,lastName, fullName, modestoAccountNumber, xfinityAccountNumber, email, mobilePhoneNumber, billingAddress,
    /// billingAddress1, billingAddress2, billingCity, billingState, billingZip
    /// (in case of billingAddress fields, correspond to service address fields for telesales, but with same key name until we come up with better sol)
    switchToManualSearchResultsTemplate: function(searchResultsData) {
        var callReason = CallData.getCallReason();
        // var callReasonString = CallData.getCallReasonString();
        // var callReasonService = CallData.getCallReasonService();

        var isRetail = (callReason === CallReasons.IS_RETAIL);
        var isTelesales = (callReason === CallReasons.IS_TELESALES);
        var isVoicecare = (callReason === CallReasons.IS_VOICECARE);

        var templateData = {
            'telesales': isTelesales,
            'voicecare': isVoicecare,
            'retail': isRetail,
            'agentAboveTier2': Agent.getAgentAboveTier2(),
            'results': searchResultsData
        };

        client.switchTo('customer-search-results', templateData);
        client.zafClient.invoke('popover', {
            width: 1200,
            height: 600
        });
        client.zafClient.invoke('resize', {
            width: 1200,
            height: 600
        });
    },

    // render Fraud Status banner
    /**
     * @description : this is to show he Fraud Status banner on the CTI APP
     * */
    showFraudReviewBanner: function() {
        var data = {
            'fraudStatus': Customer.getFraudStatus(),
            'fraudStatusClass': Customer.getFraudStatus() === 'Fraud Failed' ? "bad" : "warn"
        };
        var html = client.renderTemplate('fraud-status-banner', data);
        $('.fraud-status-div').html(html);
    },

    /// Displays Alert Overlay in center of screen
    /// @alertMessage [string]: Message to display in template
    switchToGenericAlertTemplate: function(alertMessage) {
        this.modal().then(function(modalContext) {
            var templateData = {
                'alertMessage': alertMessage
            };
            var template = client.renderTemplate('generic-alert', templateData);
            var modalClient = client.zafClient.instance(modalContext['instances.create'][0].instanceGuid);

            modalClient.invoke('resize', {
                width: 1050,
                height: '90vh'
            });
            //listen for when the modal.html document is ready
            modalClient.on('modalRendered', function() {
                //trigger the event to replace the container's content and pass the rendered template
                modalClient.trigger('drawData', template);
            });
        });

    },

    /// Order Details Template
    switchToOrderDetailsTemplate: function(orderId) {


        this.modal().then(function(modalContext) {
            // The modal is on the screen now!


            Orders.singleOrder(orderId);
            var salesChannel = Orders.getSalesChannel();
            var templateData = {
                'order': {
                    'id': Orders.getId(),
                    'date': Util.dates.formatDateYYYYMMddTHHmmSSToYYYYMMdd(Orders.getCreatedDate()) || "Not Available",
                    'status': Orders.getStatus(),
                    'devices': Orders.getDevices(),
                    'accessories': Orders.getAccessories(),
                    'paymentDetails': {
                        'cardHolderName': 'Not Available',
                        'billingAddress': Orders.getPaymentBillingAddress(),
                        'last4CC': Orders.getPaymentLast4CC()
                    },
                    'logistics': {
                        'shippingAddress': Orders.getShippingAddress(),
                        'trackingUrl': Orders.getTrackingUrl(),
                        'trackingNumber': Orders.getTrackingNumber(),
                        'shippingMethodName': Orders.getShippingMethod(),
                        'shippingStatus': Orders.getStatus(),
                        'shippedDate': Util.dates.formatDateYYYYMMddTHHmmSSToYYYYMMdd(Orders.getShippedDate()) || "Not Available",
                        'expectedDelivery': Util.dates.formatDateYYYYMMddTHHmmSSToYYYYMMdd(Orders.getExpectedDeliveryDate()) || "Not Available",
                        'actualDelivery': Util.dates.formatDateYYYYMMddTHHmmSSToYYYYMMdd(Orders.getDeliveryDate()) || "Not Available"
                    }
                },
                'orderIdInfo': {
                    'salesChannel': salesChannel,
                    'salesLocation': Orders.getSalesLocation(),
                    'agentId': Orders.getAgentId()
                }
            };
            var template = client.renderTemplate('order-details', templateData);
            var modalClient = client.zafClient.instance(modalContext['instances.create'][0].instanceGuid);

            modalClient.invoke('resize', {
                width: 1050,
                height: '90vh'
            });
            //listen for when the modal.html document is ready
            modalClient.on('modalRendered', function() {
                //trigger the event to replace the container's content and pass the rendered template
                modalClient.trigger('drawData', template);
            });

        });

    },

    switchToUsageDetailsTemplate: function() {
        this.modal().then(function(modalContext) {

            var templateData = {
                'customer': {
                    'fullName': Customer.getFullName(),
                    'modestoAccountNumber': Customer.getModestoAccountNumber(),
                    'modestoAccount': {
                        'active': StatusCodes.isActiveStatusCode(Customer.getModestoAccountStatus()),
                        'status': StatusCodes.getStatusCodeTranslation(Customer.getModestoAccountStatus(), 'account')
                    }
                },
                'usage': {
                    'lines': DataUsage.getLines(),
                    'linesData': DataUsage.getLinesData(),
                    'totalMonthNames': DataUsage.getTotalMonthNames(),
                    'totalDomesticData': DataUsage.getTotalDomesticData(),
                    'totalDomesticMinutes': DataUsage.getTotalDomesticMinutes(),
                    'totalDomesticMsgs': DataUsage.getTotalDomesticMsgs(),
                    'totalRoamingData': DataUsage.getTotalRoamingData(),
                    'totalRoamingMinutes': DataUsage.getTotalRoamingMinutes(),
                    'totalRoamingMsgs': DataUsage.getTotalRoamingMsgs(),
                    'totalIldData': DataUsage.getTotalIldData(),
                    'totalIldMinutes': DataUsage.getTotalIldMinutes(),
                    'totalIldMsgs': DataUsage.getTotalIldMsgs()
                }
            };

            var usageTemplate = client.renderTemplate('data-usage', templateData);
            var modalClient = client.zafClient.instance(modalContext['instances.create'][0].instanceGuid);

            modalClient.invoke('resize', {
                width: 1050,
                height: '90vh'
            });
            //listen for when the modal.html document is ready
            modalClient.on('modalRendered', function() {
                //trigger the event to replace the container's content and pass the rendered template
                modalClient.trigger('drawData', usageTemplate);
            });

        });

    },

    switchToDefaultTemplate: function(role) {
        var templateData = {
            'isAgentAdmin': (role === 'admin')
        };

        client.zafClient.invoke('popover', {
            width: 250,
            height: 360
        });
        client.zafClient.invoke('resize', {
            width: 250,
            height: 360
        });
        client.switchTo('app-default', templateData);

    },

    switchToAppSettingsTemplate: function(appSettings) {
        var templateData = {
            "groups": appSettings
        };
        client.switchTo('app-settings', templateData);
        client.zafClient.invoke('popover', {
            width: 350,
            height: 1000
        });
        client.zafClient.invoke('resize', {
            width: 350,
            height: 1000
        });
    },

    switchToFlowSelectTemplate: function() {
        client.switchTo('flow-select');
        client.zafClient.invoke('popover', {
            width: 400,
            height: 310
        });
        client.zafClient.invoke('resize', {
            width: 400,
            height: 310
        });

    },

    /// Displays a template with a loading icon
    /// @return void
    switchToWaitingTemplate: function() {
        client.switchTo('waiting');
        client.zafClient.invoke('popover', {
            width: 450,
            height: 350
        });
        client.zafClient.invoke('resize', {
            width: 450,
            height: 350
        });
    },


    renderErrorMessageTemplate: function(errorMessage, location) {
        var templateData = {
            'errorMessage': errorMessage
        };
        var errorTemplate = client.renderTemplate('template-error', templateData);

        // Remove Waiting Template
        $(location).next().empty();
        $(location).parent().parent().find('.toggle-icon').removeClass('spinner dotted').addClass('icon-chevron-down');

        // Show error message
        $(location).show();
        $(location).html(errorTemplate);

    },

    /// Displays a template intended for showing errors messages
    /// @errorMessage [string] Error message to display in the template
    /// @return void
    switchToGenericErrorTemplate: function(errorMessage) {
        var templateData = {
            'errorMessage': errorMessage || "Unknown Error"
        };
        client.switchTo('generic-error', templateData);
        client.zafClient.invoke('popover', {
            width: 450,
            height: 200
        });
        client.zafClient.invoke('resize', {
            width: 450,
            height: 200
        });
    }
};
