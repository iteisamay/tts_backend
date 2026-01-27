function ttsInit() {
    const t = window.parent.location.href,
        e = window.parent.location.hostname,
        o = document.currentScript.dataset,
        n = document.currentScript.id,
        r = o.ttsid,
        i = o.origin,
        a = o.hidelogo ?? 0;
    if (i == e && r && 32 == r.length && /^[a-zA-Z0-9].*$/.test(r)) {
        const e = new XMLHttpRequest,
            o = "https://tts.eisamay.in/PlayAPI?Origin=" + i + "&ttsid=" + r;
        e.open("GET", o, !1), e.onload = function() {
            if (200 === e.status) {
                if (1 == e.responseText) {
                    let e = document.getElementById("ttsContainer");
                    if (!e) {
                        e = document.createElement("div"), e.setAttribute("id", "ttsContainer");
                        let t = document.getElementById(n);
                        t.parentNode.insertBefore(e, t)
                    }
                    i = "#ttsContainer * {font-family: system-ui;} #ttsContainer .bg-danger{background-color:var(--bs-danger,#dc3545)!important}#ttsContainer .btn{display:inline-block;font-weight:400;line-height:1.5;color:var(--bs-body-color,#212529);text-align:center;text-decoration:none;vertical-align:middle;cursor:pointer;user-select:none;background-color:transparent;border:1px solid transparent;padding:.375rem .75rem;font-size:1rem;border-radius:.375rem;transition:color .15s ease-in-out,background-color .15s ease-in-out,border-color .15s ease-in-out,box-shadow .15s ease-in-out}#ttsContainer .btn-danger{color:#fff;background-color:var(--bs-danger,#dc3545);border-color:var(--bs-danger,#dc3545)}#ttsContainer .btn-danger:hover{color:#fff;background-color:#bb2d3b;border-color:#b02a37}#ttsContainer .btn-outline-danger{color:var(--bs-danger,#dc3545);border-color:var(--bs-danger,#dc3545)}#ttsContainer .btn-outline-danger:hover{color:#fff;background-color:var(--bs-danger,#dc3545);border-color:var(--bs-danger,#dc3545)}#ttsContainer .btn-group{position:relative;display:inline-flex;vertical-align:middle}#ttsContainer .btn-group-sm > .btn{padding:.25rem .5rem;font-size:.875rem;border-radius:.25rem}#ttsContainer .fw-bold{font-weight:700!important}#ttsContainer .h-100{height:100%!important}#ttsContainer .m-0{margin:0!important}#ttsContainer .py-1{padding-top:.5rem!important;padding-bottom:.5rem!important}#ttsContainer .w-100{width:100%!important}#ttsContainer .position-absolute{position:absolute!important}#ttsContainer .start-0{left:0!important}#ttsContainer .top-0{top:0!important}#ttsContainer .progress{display:flex;height:1rem;overflow:hidden;font-size:.75rem;background-color:var(--bs-secondary-bg,#e9ecef);border-radius:var(--bs-border-radius,0.375rem)}#ttsContainer .progress-bar{display:flex;flex-direction:column;justify-content:center;overflow:hidden;color:#fff;text-align:center;white-space:nowrap;background-color:var(--bs-primary,#0d6efd);transition:width .6s ease}#ttsContainer .rounded-0{border-radius:0!important}#ttsContainer .listenArticleBtn{position: relative;}#ttsContainer .button-text{} #ttsContainer .btn-group>.btn-group:not(:last-child)>.btn, .btn-group>.btn.dropdown-toggle-split:first-child, #ttsContainer .btn-group>.btn:not(:last-child):not(.dropdown-toggle) {border-top-right-radius: 0;border-bottom-right-radius:0;} #ttsContainer .btn-group>.btn-group:not(:first-child)>.btn, #ttsContainer .btn-group>.btn:nth-child(n+3), #ttsContainer .btn-group>:not(.btn-check)+.btn {border-top-left-radius: 0;border-bottom-left-radius: 0;} #ttsContainer svg {vertical-align: middle;} #ttsContainer .d-none{display: none !important;}", document.head.appendChild(document.createElement("style")).innerHTML = i;
                    var o = '<div class="btn-group btn-group py-1" role="group" aria-label="Listen Article Button">';
                    o += 1 == a ? "" : '<a target="_blank" type="button" class="btn btn-danger" title="Powered by EiSamay" href="https://tts.eisamay.in/?utm_source=' + t + '"><svg style="width: 24px; height: 24px; fill: #FFF;" xmlns="http://www.w3.org/2000/svg" xml:space="preserve" version="1.1" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" image-rendering="optimizeQuality" fill-rule="evenodd" clip-rule="evenodd" viewBox="0 0 492.87 416.09" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xodm="http://www.corel.com/coreldraw/odm/2003"><g id="Layer_x0020_1"><path fill="white" fill-rule="nonzero" d="M348.61 145.36l2.07 -7.58c0.92,-3.68 0.35,-6.78 -1.72,-9.3 -2.07,-2.53 -4.94,-3.79 -8.61,-3.79l-223.89 0c-9.65,0 -18.37,-2.07 -26.18,-6.2 -7.81,-4.13 -14.24,-9.53 -19.29,-16.19 -5.05,-6.66 -8.5,-14.35 -10.33,-23.08 -1.84,-8.72 -1.61,-17.68 0.69,-26.86l13.77 -52.36 303.12 0c18.83,0 36.05,4.13 51.66,12.4 15.62,8.27 28.59,19.06 38.93,32.38 10.33,13.32 17.45,28.59 21.35,45.81 3.91,17.22 3.56,35.02 -1.03,53.39l-54.42 202.53c-5.52,20.67 -16.65,37.43 -33.41,50.29 -16.77,12.86 -35.94,19.29 -57.53,19.29l-223.89 -0.69c-19.75,0 -37.89,-4.25 -54.42,-12.74 -16.53,-8.5 -30.08,-19.75 -40.64,-33.76 -10.57,-14.01 -17.92,-30.08 -22.05,-48.22 -4.13,-18.14 -3.67,-36.63 1.38,-55.46l2.75 -10.33c3.22,-12.86 8.62,-24.8 16.19,-35.82 7.58,-11.03 16.42,-20.44 26.53,-28.25 10.1,-7.8 21.35,-13.89 33.75,-18.25 12.4,-4.36 25.49,-6.55 39.27,-6.55l188.07 0 -13.78 51.67c-3.68,12.4 -10.57,22.5 -20.67,30.31 -10.1,7.81 -21.58,11.71 -34.44,11.71l-84.05 0c-7.81,0 -12.86,3.91 -15.15,11.71 -1.38,5.06 -0.46,9.53 2.75,13.44 3.22,3.9 7.35,5.85 12.4,5.85l135.71 0c5.06,0 9.42,-1.38 13.09,-4.13 3.68,-2.76 5.97,-6.43 6.89,-11.02l1.38 -5.51 33.75 -124.69z" /></g></svg></a>', o += '<button style="min-width: 225px;" title="Listen to this Article" class="listenArticleBtn btn btn-outline-danger" type="button" data-is-playing="false" data-article-id="' + r + '"><svg style="width: 20px; height: 20px; fill: currentColor; margin: -4px 5px 0;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M160 288C160 199.6 231.6 128 320 128C408.4 128 480 199.6 480 288L480 325.5C470 322 459.2 320 448 320L432 320C405.5 320 384 341.5 384 368L384 496C384 522.5 405.5 544 432 544L448 544C501 544 544 501 544 448L544 288C544 164.3 443.7 64 320 64C196.3 64 96 164.3 96 288L96 448C96 501 139 544 192 544L208 544C234.5 544 256 522.5 256 496L256 368C256 341.5 234.5 320 208 320L192 320C180.8 320 170 321.9 160 325.5L160 288z" /></svg>Listen to this Article</button>', o += "</div>", e.innerHTML += o;
                    const s = document.querySelector(".ttsListenArticleBtn");
                    s && s.addEventListener("click", (function() {
                        const t = s.getAttribute("data-article-id");
                        var e = s.getAttribute("data-is-playing");
                        const o = document.getElementById("TtsAudioPlayer") ? document.getElementById("TtsAudioPlayer") : document.createElement("audio");
                        if (o.src) "false" == e ? (o.play(), s.setAttribute("data-is-playing", !0), s.classList.remove("active"), s.innerHTML = '<span class="button-text"><svg style="width: 16px;margin-top: -3px;height: 16px;" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 1H2V15H7V1Z" fill="currentColor"/><path d="M14 1H9V15H14V1Z" fill="currentColor"/></svg> Click to Pause</span><div class="progress position-absolute w-100 h-100 top-0 start-0 m-0 rounded-0" style="opacity: 0.5;"><div id="progressInsideBtn" class="progress-bar bg-danger" role="progressbar" aria-valuemin="0" aria-valuemax="100"></div></div>') : (o.pause(), s.setAttribute("data-is-playing", !1), s.innerHTML = '<svg style="width: 20px; height: 20px; fill: currentColor; margin: -4px 5px 0;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M160 288C160 199.6 231.6 128 320 128C408.4 128 480 199.6 480 288L480 325.5C470 322 459.2 320 448 320L432 320C405.5 320 384 341.5 384 368L384 496C384 522.5 405.5 544 432 544L448 544C501 544 544 501 544 448L544 288C544 164.3 443.7 64 320 64C196.3 64 96 164.3 96 288L96 448C96 501 139 544 192 544L208 544C234.5 544 256 522.5 256 496L256 368C256 341.5 234.5 320 208 320L192 320C180.8 320 170 321.9 160 325.5L160 288z" /></svg>Listen to this Article');
                        else {
                            o.src = "https://tts.eisamay.in/" + t + ".mp3", o.controls = !0, o.id = "TtsAudioPlayer", o.classList.add("d-none");
                            document.getElementById("TtsAudioPlayer").appendChild(o), o.play(), s.setAttribute("data-is-playing", !0), s.innerHTML = '<span class="button-text"><svg style="width: 16px;margin-top: -3px;height: 16px;" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 1H2V15H7V1Z" fill="currentColor"/><path d="M14 1H9V15H14V1Z" fill="currentColor"/></svg> Click to Pause</span><div class="progress position-absolute w-100 h-100 top-0 start-0 m-0 rounded-0" style="opacity: 0.5;"><div id="progressInsideBtn" class="progress-bar bg-danger" role="progressbar" aria-valuemin="0" aria-valuemax="100"></div></div>', UpdateStats(t)
                        }
                        o.addEventListener("loadedmetadata", (() => {
                            o.currentTime;
                            const t = o.duration;
                            if (t > 0) {}
                        })), o.addEventListener("timeupdate", (() => {
                            const t = o.currentTime,
                                e = o.duration;
                            if (e > 0) {
                                const o = t / e * 100,
                                    n = document.getElementById("progressInsideBtn");
                                n.style.width = `${o}%`, n.setAttribute("aria-valuenow", `${o}`)
                            }
                        })), o.addEventListener("ended", (() => {
                            o.pause(), s.setAttribute("data-is-playing", !1), s.innerHTML = '<svg style="width: 24px; height: 24px; fill: #FFF;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M160 288C160 199.6 231.6 128 320 128C408.4 128 480 199.6 480 288L480 325.5C470 322 459.2 320 448 320L432 320C405.5 320 384 341.5 384 368L384 496C384 522.5 405.5 544 432 544L448 544C501 544 544 501 544 448L544 288C544 164.3 443.7 64 320 64C196.3 64 96 164.3 96 288L96 448C96 501 139 544 192 544L208 544C234.5 544 256 522.5 256 496L256 368C256 341.5 234.5 320 208 320L192 320C180.8 320 170 321.9 160 325.5L160 288z" /></svg>Listen to this Article'
                        }))
                    }))
                }
            } else console.error("Error fetching data:", e.statusText);
            var i
        }, e.onerror = function() {
            console.error("Network error occurred.")
        }, e.send()
    }
}

function UpdateStats(t) {
    let e = new XMLHttpRequest;
    const o = "https://tts.eisamy.in/UpdateStatsAPI?ttsid=" + t;
    e.open("GET", o, !1), e.send()
}
ttsInit();