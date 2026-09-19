/* ============================================================================
   CHROMVAULT — PUBLIC REVIEW SUBMISSION (COMMAND CENTER FALLBACK)
   ----------------------------------------------------------------------------
   Allows customers to submit product reviews even if the link points to the
   admin Vercel domain. If an external storefront URL is configured in Settings,
   redirects to the storefront; otherwise renders a standalone review card.
   ========================================================================== */
(function (global) {
  'use strict';

  function getQueryParam(name) {
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.has(name)) return params.get(name);
      var hash = window.location.hash || '';
      var qIdx = hash.indexOf('?');
      if (qIdx >= 0) {
        var hParams = new URLSearchParams(hash.slice(qIdx + 1));
        if (hParams.has(name)) return hParams.get(name);
      }
    } catch (e) {}
    return null;
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function init() {
    var token = getQueryParam('token');

    // 1. Check if an external storefront URL is saved in Settings or auto-detect it
    try {
      var targetOrigin = '';
      var saved = localStorage.getItem('chromvault_storefront_url');
      if (saved && saved.trim()) {
        targetOrigin = saved.trim().replace(/\/+$/, '');
      } else {
        var host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
          targetOrigin = window.location.protocol + '//' + host + ':3000';
        } else if (host.endsWith('.vercel.app')) {
          var storeHost = host.replace(/-admin\b/i, '').replace(/\badmin-/i, '');
          if (storeHost !== host) {
            targetOrigin = window.location.protocol + '//' + storeHost;
          }
        }
      }

      if (targetOrigin && targetOrigin !== window.location.origin) {
        var targetUrl = targetOrigin + '/review' + window.location.search + window.location.hash;
        window.location.replace(targetUrl);
        return;
      }
    } catch (e) {}

    // 2. Hide admin app and login screen, show public view
    var app = document.getElementById('app');
    if (app) { app.hidden = true; app.style.display = 'none'; }
    var ls = document.getElementById('loginScreen');
    if (ls) { ls.hidden = true; ls.style.display = 'none'; }
    var ps = document.getElementById('publicScreen');
    if (!ps) return;
    ps.hidden = false;
    ps.style.display = 'grid';

    var card = document.getElementById('publicCard');
    if (!card) return;

    if (!token) {
      card.innerHTML =
        '<div class="login-brand">' +
          '<div class="brand-mark">C</div>' +
          '<div><b>Chromvault</b><span>Verified Reviews</span></div>' +
        '</div>' +
        '<div style="text-align:center;padding:24px 0">' +
          '<h2 style="color:var(--bad);font-size:20px;margin-bottom:8px">Invalid Link</h2>' +
          '<p style="color:var(--ink-2);font-size:14px;line-height:1.5">This review link is missing a verification token or has expired.</p>' +
        '</div>';
      return;
    }

    // Loading State
    card.innerHTML =
      '<div class="login-brand">' +
        '<div class="brand-mark">C</div>' +
        '<div><b>Chromvault</b><span>Verified Reviews</span></div>' +
      '</div>' +
      '<div style="text-align:center;padding:40px 0">' +
        '<div class="spinner" style="margin:0 auto 16px"></div>' +
        '<div style="color:var(--ink-2);font-size:14px">Verifying order piece…</div>' +
      '</div>';

    // Validate token with backend
    fetch('/api/reviews/validate/' + encodeURIComponent(token))
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.message || 'Review link is invalid or has already been used.');
          return data;
        });
      })
      .then(function (res) {
        var imgHtml = res.productImage
          ? '<img src="' + esc(res.productImage) + '" style="width:68px;height:68px;border-radius:10px;object-fit:cover;border:1px solid var(--line);flex-shrink:0">'
          : '';

        card.innerHTML =
          '<div class="login-brand" style="margin-bottom:20px">' +
            '<div class="brand-mark">C</div>' +
            '<div><b>Chromvault</b><span>Verified Buyer Review</span></div>' +
          '</div>' +

          '<div style="background:var(--near-black);border:1px solid var(--line-soft);border-radius:var(--r-md);padding:14px;display:flex;align-items:center;gap:14px;margin-bottom:24px">' +
            imgHtml +
            '<div style="min-width:0">' +
              '<div style="font-size:11px;color:var(--ink-3);text-transform:uppercase;letter-spacing:0.08em">Purchased Item</div>' +
              '<div style="font-weight:600;font-size:16px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">' + esc(res.productTitle || 'Chromvault Piece') + '</div>' +
            '</div>' +
          '</div>' +

          '<form id="pubReviewForm" style="display:flex;flex-direction:column;gap:20px">' +
            '<div>' +
              '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:8px;color:var(--ink-2)">Your Rating <span style="color:var(--bad)">*</span></label>' +
              '<div class="star-rating" id="pubStars">' +
                '<span data-val="1">★</span>' +
                '<span data-val="2">★</span>' +
                '<span data-val="3">★</span>' +
                '<span data-val="4">★</span>' +
                '<span data-val="5">★</span>' +
              '</div>' +
              '<input type="hidden" id="pubRatingVal" required>' +
            '</div>' +

            '<div class="field">' +
              '<label for="pubReviewText" style="display:block;font-size:13px;font-weight:600;margin-bottom:8px;color:var(--ink-2)">Your Review</label>' +
              '<textarea class="input" id="pubReviewText" placeholder="What did you think of the design, craft and finish?" style="min-height:110px;line-height:1.5"></textarea>' +
            '</div>' +

            '<button type="submit" class="btn primary" id="pubSubmitBtn" style="height:48px;font-size:15px;justify-content:center;margin-top:4px">Submit Review</button>' +
          '</form>';

        var rating = 0;
        var stars = card.querySelectorAll('#pubStars span');
        var rInput = card.querySelector('#pubRatingVal');

        function highlight(val) {
          stars.forEach(function (s, idx) {
            s.style.color = (idx < val) ? '#FFD700' : 'var(--line)';
          });
        }

        stars.forEach(function (s) {
          s.addEventListener('mouseover', function () {
            highlight(parseInt(s.getAttribute('data-val'), 10));
          });
          s.addEventListener('mouseout', function () {
            highlight(rating);
          });
          s.addEventListener('click', function () {
            rating = parseInt(s.getAttribute('data-val'), 10);
            rInput.value = rating;
            highlight(rating);
          });
        });

        // Submit form
        card.querySelector('#pubReviewForm').addEventListener('submit', function (e) {
          e.preventDefault();
          if (!rating) {
            alert('Please choose a star rating (1 to 5).');
            return;
          }

          var submitBtn = card.querySelector('#pubSubmitBtn');
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px"></span> Submitting…';

          var text = (card.querySelector('#pubReviewText').value || '').trim();

          fetch('/api/reviews/submit/' + encodeURIComponent(token), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating: rating, text: text })
          })
            .then(function (submitRes) {
              return submitRes.json().then(function (data) {
                if (!submitRes.ok) throw new Error(data.message || 'Failed to submit review');
                return data;
              });
            })
            .then(function () {
              card.innerHTML =
                '<div class="login-brand">' +
                  '<div class="brand-mark">C</div>' +
                  '<div><b>Chromvault</b><span>Verified Reviews</span></div>' +
                '</div>' +
                '<div style="text-align:center;padding:30px 10px">' +
                  '<div style="width:58px;height:58px;border-radius:50%;background:rgba(70,230,160,0.12);color:var(--ok);border:1px solid rgba(70,230,160,0.3);display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 20px">✓</div>' +
                  '<h2 style="font-size:22px;margin-bottom:8px">Review Submitted</h2>' +
                  '<p style="color:var(--ink-2);font-size:14px;line-height:1.6;max-width:380px;margin:0 auto">Thank you for sharing your experience. Your review has been recorded and will appear on the product page.</p>' +
                '</div>';
            })
            .catch(function (err) {
              alert(err.message || 'Submission failed');
              submitBtn.disabled = false;
              submitBtn.textContent = 'Submit Review';
            });
        });
      })
      .catch(function (err) {
        card.innerHTML =
          '<div class="login-brand">' +
            '<div class="brand-mark">C</div>' +
            '<div><b>Chromvault</b><span>Verified Reviews</span></div>' +
          '</div>' +
          '<div style="text-align:center;padding:24px 0">' +
            '<div style="width:52px;height:52px;border-radius:50%;background:rgba(255,95,109,0.1);color:var(--bad);border:1px solid rgba(255,95,109,0.25);display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 18px">✕</div>' +
            '<h2 style="font-size:20px;color:var(--ink);margin-bottom:8px">Unable to Load Review</h2>' +
            '<p style="color:var(--ink-2);font-size:14px;line-height:1.5;max-width:360px;margin:0 auto">' + esc(err.message) + '</p>' +
          '</div>';
      });
  }

  global.PublicReview = {
    init: init
  };
})(window);
