
    (function() {
      var preconnectOrigins = ["https://cdn.shopify.com"];
      var scripts = ["/cdn/shopifycloud/checkout-web/assets/c1/polyfills-legacy.CjqKEFia.js","/cdn/shopifycloud/checkout-web/assets/c1/app-legacy.Bd072YG_.js","/cdn/shopifycloud/checkout-web/assets/c1/esnext-vendor-legacy.t7jK1wdr.js","/cdn/shopifycloud/checkout-web/assets/c1/context-browser-legacy.JQposp7i.js","/cdn/shopifycloud/checkout-web/assets/c1/checkout-policy-legacy.CVBYiCZ3.js","/cdn/shopifycloud/checkout-web/assets/c1/shop-pay-flags-legacy.B53ZBARe.js","/cdn/shopifycloud/checkout-web/assets/c1/page-rendered-hooks-legacy.BuCBjwcg.js","/cdn/shopifycloud/checkout-web/assets/c1/shared-shop-theme-legacy.BK6seySv.js","/cdn/shopifycloud/checkout-web/assets/c1/shop-pay-ProgressIntercepts-legacy.BQqIby-A.js","/cdn/shopifycloud/checkout-web/assets/c1/receipt-mapper-load-recovery-legacy.DIG-Jqd9.js","/cdn/shopifycloud/checkout-web/assets/c1/receipt-eager-mappers-legacy.CmIU4OgS.js","/cdn/shopifycloud/checkout-web/assets/c1/error-logger-report-graphql-error-legacy.O36M6qPs.js","/cdn/shopifycloud/checkout-web/assets/c1/graphql-PaymentSessionMutation-legacy.Dw2U9RIS.js","/cdn/shopifycloud/checkout-web/assets/c1/shop-pay-normalizeBuyerDetails-legacy.DhBYm9v6.js","/cdn/shopifycloud/checkout-web/assets/c1/mobile-checkout-sdk-MobileCheckoutSdkClient-legacy.CnhwvqdJ.js","/cdn/shopifycloud/checkout-web/assets/c1/utilities-shopCashMoney-legacy.CTwRisps.js","/cdn/shopifycloud/checkout-web/assets/c1/utilities-browser-legacy.RjZKnq2s.js","/cdn/shopifycloud/checkout-web/assets/c1/hydrate-legacy.lQNCfFK0.js","/cdn/shopifycloud/checkout-web/assets/c1/shop-pay-installments-monorail-legacy.DBT8xIjb.js","/cdn/shopifycloud/checkout-web/assets/c1/locale-en-legacy.A9JjeKRA.js","/cdn/shopifycloud/checkout-web/assets/c1/OnePage-legacy.BSGdLLTE.js","/cdn/shopifycloud/checkout-web/assets/c1/components-DeliveryTransition-legacy.D63QIOLi.js","/cdn/shopifycloud/checkout-web/assets/c1/useShopPayButtonClassName-legacy.BCF6o1Al.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useShowShopPayOptin-legacy.CWKK8FLp.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-usePickupPoints-legacy.BvbK1xZL.js","/cdn/shopifycloud/checkout-web/assets/c1/ChangeCompanyLocationLink-legacy.5RtYWsea.js","/cdn/shopifycloud/checkout-web/assets/c1/BillingAddressForm-legacy.D23BRdhK.js","/cdn/shopifycloud/checkout-web/assets/c1/PhoneField-legacy.CX0G2D_0.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useSuppressShopPayModalOnLoad-legacy.lNGCYul8.js","/cdn/shopifycloud/checkout-web/assets/c1/utilities-compact-legacy.C4QhW3ia.js","/cdn/shopifycloud/checkout-web/assets/c1/Popover-legacy.CrIn31qW.js","/cdn/shopifycloud/checkout-web/assets/c1/Choice-legacy.KiEw88Ua.js","/cdn/shopifycloud/checkout-web/assets/c1/Checkbox-legacy.D_DpG7B-.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useUnauthenticatedErrorModal-legacy.yXU6SV8s.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useCanChangeCompanyLocation-legacy.0XL7QHlm.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useForceShopPayUrl-legacy.DHudbH7P.js","/cdn/shopifycloud/checkout-web/assets/c1/shipping-methods-grouping-legacy.BOgblKxC.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useEcpSpiDebugLog-legacy.Dl0JNcss.js","/cdn/shopifycloud/checkout-web/assets/c1/ShopPayLogo-legacy.BDoKpdsG.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useWalletsTimeout-legacy.BrTvNYy2.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-usePostPurchase-legacy.CxQHfHgn.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useWalletsMonorailTrack-legacy.BtJyO4gD.js","/cdn/shopifycloud/checkout-web/assets/c1/IncentiveBadge-legacy.BBMohlMV.js","/cdn/shopifycloud/checkout-web/assets/c1/Section-SectionStyleOverride-legacy.Bs_uco1p.js","/cdn/shopifycloud/checkout-web/assets/c1/AutocompleteField-hooks-legacy.D_gHvFyV.js","/cdn/shopifycloud/checkout-web/assets/c1/PendingShipping-legacy.BUaGydIn.js","/cdn/shopifycloud/checkout-web/assets/c1/useAddressMutationsWithNegotiation-legacy.fbThVJjS.js","/cdn/shopifycloud/checkout-web/assets/c1/PaymentIcon-legacy.BrOc64V7.js","/cdn/shopifycloud/checkout-web/assets/c1/PaymentLine-legacy.t-9gsUYA.js","/cdn/shopifycloud/checkout-web/assets/c1/Theme-ThemeOverride-legacy.SnA9qJlH.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useUpdateCheckoutAddress-legacy.D99QAqGv.js","/cdn/shopifycloud/checkout-web/assets/c1/payment-usePaymentExemptionReason-legacy.MqTm73nO.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useShopPayProgressIntercepts-legacy.CKamKXs1.js","/cdn/shopifycloud/checkout-web/assets/c1/Section-legacy.vk1lP7pE.js","/cdn/shopifycloud/checkout-web/assets/c1/PaymentErrorBanner-legacy.DGKcdEjt.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useGeneralPaymentErrorMessage-legacy.CP7bg2mx.js","/cdn/shopifycloud/checkout-web/assets/c1/StickyPayButton-StickyPayButton.module-legacy.BilQkPHC.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-payment-button-legacy.DCpGjucr.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-usePreselectSpi-legacy.dfIdaWf6.js","/cdn/shopifycloud/checkout-web/assets/c1/Switch-legacy.Dfub1jxp.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useAvailableShopPromotionDiscounts-legacy.BOjXALjB.js","/cdn/shopifycloud/checkout-web/assets/c1/Middot-legacy.BGD3HWF2.js","/cdn/shopifycloud/checkout-web/assets/c1/EstimatedDeliveryContent-legacy.CECJ-Umx.js","/cdn/shopifycloud/checkout-web/assets/c1/ShippingMethodRateLabel-legacy.BMfdGE48.js","/cdn/shopifycloud/checkout-web/assets/c1/shipping-methods-consolidated-included-legacy.CG7NSGnT.js","/cdn/shopifycloud/checkout-web/assets/c1/ShippingLines-legacy.CnqGQECJ.js","/cdn/shopifycloud/checkout-web/assets/c1/ShipmentBreakdown-legacy.H9ASTP6a.js","/cdn/shopifycloud/checkout-web/assets/c1/MerchandiseModal-legacy.uD3x2XfH.js","/cdn/shopifycloud/checkout-web/assets/c1/ShippingMethodSelector-legacy.jzHpisTf.js","/cdn/shopifycloud/checkout-web/assets/c1/TextArea-legacy.BoejvXpN.js","/cdn/shopifycloud/checkout-web/assets/c1/SubscriptionPriceBreakdown-legacy.B86GkxEp.js","/cdn/shopifycloud/checkout-web/assets/c1/StockProblems-StockProblemsLineItemList-legacy.kb1TljTX.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useShopPayNewSignupLoginExperiment-legacy.BiOrxWAS.js","/cdn/shopifycloud/checkout-web/assets/c1/page-BelowTheFoldContent-legacy.cbWUbIy8.js","/cdn/shopifycloud/checkout-web/assets/c1/Captcha-legacy.CgvqZdJH.js","/cdn/shopifycloud/checkout-web/assets/c1/ShopPayCaptcha-legacy.ZAN_W2p0.js","/cdn/shopifycloud/checkout-web/assets/c1/RememberMeSection-legacy.BGOIID39.js","/cdn/shopifycloud/checkout-web/assets/c1/PaymentMethods-legacy.qjqzcNQK.js","/cdn/shopifycloud/checkout-web/assets/c1/MobileOrderSummary-legacy.CEL5uREu.js","/cdn/shopifycloud/checkout-web/assets/c1/useShopPaySessionTokenStorage-legacy.Dqg_4sTh.js","/cdn/shopifycloud/checkout-web/assets/c1/PayButtonSection-legacy.CFmyB4KG.js","/cdn/shopifycloud/checkout-web/assets/c1/PaymentButtons-legacy.CWxLjA7b.js","/cdn/shopifycloud/checkout-web/assets/c1/money-toShopPayMoneyInput-legacy.CNQPMoMf.js","/cdn/shopifycloud/checkout-web/assets/c1/utils-useViolationsHandler-legacy.hK7O044F.js","/cdn/shopifycloud/checkout-web/assets/c1/PaymentOptionSelector-legacy.mcLwwNQn.js","/cdn/shopifycloud/checkout-web/assets/c1/BillingAddressSelector-legacy.DNsXARaq.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useStableHostMethodsReferences-legacy.ChYWNUOC.js"];
      var styles = [];
      var fontPreconnectUrls = [];
      var fontPrefetchUrls = [];
      var imgPrefetchUrls = [];

      function preconnect(url, callback) {
        var link = document.createElement('link');
        link.rel = 'dns-prefetch preconnect';
        link.href = url;
        link.crossOrigin = '';
        link.onload = link.onerror = callback;
        document.head.appendChild(link);
      }

      function preconnectAssets() {
        var resources = preconnectOrigins.concat(fontPreconnectUrls);
        var index = 0;
        (function next() {
          var res = resources[index++];
          if (res) preconnect(res, next);
        })();
      }

      function prefetch(url, as, callback) {
        var link = document.createElement('link');
        if (link.relList.supports('prefetch')) {
          link.rel = 'prefetch';
          link.fetchPriority = 'low';
          link.as = as;
          if (as === 'font') link.type = 'font/woff2';
          link.href = url;
          link.crossOrigin = '';
          link.onload = link.onerror = callback;
          document.head.appendChild(link);
        } else {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.onloadend = callback;
          xhr.send();
        }
      }

      function prefetchAssets() {
        var resources = [].concat(
          scripts.map(function(url) { return [url, 'script']; }),
          styles.map(function(url) { return [url, 'style']; }),
          fontPrefetchUrls.map(function(url) { return [url, 'font']; }),
          imgPrefetchUrls.map(function(url) { return [url, 'image']; })
        );
        var index = 0;
        function run() {
          var res = resources[index++];
          if (res) prefetch(res[0], res[1], next);
        }
        var next = (self.requestIdleCallback || setTimeout).bind(self, run);
        next();
      }

      function onLoaded() {
        try {
          if (parseFloat(navigator.connection.effectiveType) > 2 && !navigator.connection.saveData) {
            preconnectAssets();
            prefetchAssets();
          }
        } catch (e) {}
      }

      if (document.readyState === 'complete') {
        onLoaded();
      } else {
        addEventListener('load', onLoaded);
      }
    })();
  