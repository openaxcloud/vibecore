const se=typeof __SENTRY_DEBUG__>"u"||__SENTRY_DEBUG__,q=globalThis,ye="10.44.0";function et(){return tt(q),q}function tt(t){const e=t.__SENTRY__=t.__SENTRY__||{};return e.version=e.version||ye,e[ye]=e[ye]||{}}function Ne(t,e,n=q){const r=n.__SENTRY__=n.__SENTRY__||{},o=r[ye]=r[ye]||{};return o[t]||(o[t]=e())}const nn="Sentry Logger ",dt={};function rn(t){if(!("console"in q))return t();const e=q.console,n={},r=Object.keys(dt);r.forEach(o=>{const i=dt[o];n[o]=e[o],e[o]=i});try{return t()}finally{r.forEach(o=>{e[o]=n[o]})}}function on(){rt().enabled=!0}function an(){rt().enabled=!1}function Nt(){return rt().enabled}function sn(...t){nt("log",...t)}function cn(...t){nt("warn",...t)}function ln(...t){nt("error",...t)}function nt(t,...e){se&&Nt()&&rn(()=>{q.console[t](`${nn}[${t}]:`,...e)})}function rt(){return se?Ne("loggerSettings",()=>({enabled:!1})):{enabled:!1}}const Y={enable:on,disable:an,isEnabled:Nt,log:sn,warn:cn,error:ln},un=Object.prototype.toString;function _n(t,e){return un.call(t)===`[object ${e}]`}function dn(t){return _n(t,"Object")}function fn(t){return!!(t?.then&&typeof t.then=="function")}const hn=q;function pn(){try{return hn.document.location.href}catch{return""}}function gn(t,e,n){try{Object.defineProperty(t,e,{value:n,writable:!0,configurable:!0})}catch{se&&Y.log(`Failed to add non-enumerable property "${e}" to object`,t)}}let de;function He(t){if(de!==void 0)return de?de(t):t();const e=Symbol.for("__SENTRY_SAFE_RANDOM_ID_WRAPPER__"),n=q;return e in n&&typeof n[e]=="function"?(de=n[e],de(t)):(de=null,t())}function Ye(){return He(()=>Math.random())}function mn(){return He(()=>Date.now())}function bn(t,e=0){return typeof t!="string"||e===0||t.length<=e?t:`${t.slice(0,e)}...`}function vn(){const t=q;return t.crypto||t.msCrypto}let We;function yn(){return Ye()*16}function Se(t=vn()){try{if(t?.randomUUID)return He(()=>t.randomUUID()).replace(/-/g,"")}catch{}return We||(We="10000000100040008000"+1e11),We.replace(/[018]/g,e=>(e^(yn()&15)>>e/4).toString(16))}const Ht=1e3;function Pt(){return mn()/Ht}function Sn(){const{performance:t}=q;if(!t?.now||!t.timeOrigin)return Pt;const e=t.timeOrigin;return()=>(e+He(()=>t.now()))/Ht}let ft;function wn(){return(ft??(ft=Sn()))()}function Cn(t,e={}){if(e.user&&(!t.ipAddress&&e.user.ip_address&&(t.ipAddress=e.user.ip_address),!t.did&&!e.did&&(t.did=e.user.id||e.user.email||e.user.username)),t.timestamp=e.timestamp||wn(),e.abnormal_mechanism&&(t.abnormal_mechanism=e.abnormal_mechanism),e.ignoreDuration&&(t.ignoreDuration=e.ignoreDuration),e.sid&&(t.sid=e.sid.length===32?e.sid:Se()),e.init!==void 0&&(t.init=e.init),!t.did&&e.did&&(t.did=`${e.did}`),typeof e.started=="number"&&(t.started=e.started),t.ignoreDuration)t.duration=void 0;else if(typeof e.duration=="number")t.duration=e.duration;else{const n=t.timestamp-t.started;t.duration=n>=0?n:0}e.release&&(t.release=e.release),e.environment&&(t.environment=e.environment),!t.ipAddress&&e.ipAddress&&(t.ipAddress=e.ipAddress),!t.userAgent&&e.userAgent&&(t.userAgent=e.userAgent),typeof e.errors=="number"&&(t.errors=e.errors),e.status&&(t.status=e.status)}function Bt(t,e,n=2){if(!e||typeof e!="object"||n<=0)return e;if(t&&Object.keys(e).length===0)return t;const r={...t};for(const o in e)Object.prototype.hasOwnProperty.call(e,o)&&(r[o]=Bt(r[o],e[o],n-1));return r}function ht(){return Se()}const Ze="_sentrySpan";function pt(t,e){e?gn(t,Ze,e):delete t[Ze]}function gt(t){return t[Ze]}const En=100;class te{constructor(){this._notifyingListeners=!1,this._scopeListeners=[],this._eventProcessors=[],this._breadcrumbs=[],this._attachments=[],this._user={},this._tags={},this._attributes={},this._extra={},this._contexts={},this._sdkProcessingMetadata={},this._propagationContext={traceId:ht(),sampleRand:Ye()}}clone(){const e=new te;return e._breadcrumbs=[...this._breadcrumbs],e._tags={...this._tags},e._attributes={...this._attributes},e._extra={...this._extra},e._contexts={...this._contexts},this._contexts.flags&&(e._contexts.flags={values:[...this._contexts.flags.values]}),e._user=this._user,e._level=this._level,e._session=this._session,e._transactionName=this._transactionName,e._fingerprint=this._fingerprint,e._eventProcessors=[...this._eventProcessors],e._attachments=[...this._attachments],e._sdkProcessingMetadata={...this._sdkProcessingMetadata},e._propagationContext={...this._propagationContext},e._client=this._client,e._lastEventId=this._lastEventId,e._conversationId=this._conversationId,pt(e,gt(this)),e}setClient(e){this._client=e}setLastEventId(e){this._lastEventId=e}getClient(){return this._client}lastEventId(){return this._lastEventId}addScopeListener(e){this._scopeListeners.push(e)}addEventProcessor(e){return this._eventProcessors.push(e),this}setUser(e){return this._user=e||{email:void 0,id:void 0,ip_address:void 0,username:void 0},this._session&&Cn(this._session,{user:e}),this._notifyScopeListeners(),this}getUser(){return this._user}setConversationId(e){return this._conversationId=e||void 0,this._notifyScopeListeners(),this}setTags(e){return this._tags={...this._tags,...e},this._notifyScopeListeners(),this}setTag(e,n){return this.setTags({[e]:n})}setAttributes(e){return this._attributes={...this._attributes,...e},this._notifyScopeListeners(),this}setAttribute(e,n){return this.setAttributes({[e]:n})}removeAttribute(e){return e in this._attributes&&(delete this._attributes[e],this._notifyScopeListeners()),this}setExtras(e){return this._extra={...this._extra,...e},this._notifyScopeListeners(),this}setExtra(e,n){return this._extra={...this._extra,[e]:n},this._notifyScopeListeners(),this}setFingerprint(e){return this._fingerprint=e,this._notifyScopeListeners(),this}setLevel(e){return this._level=e,this._notifyScopeListeners(),this}setTransactionName(e){return this._transactionName=e,this._notifyScopeListeners(),this}setContext(e,n){return n===null?delete this._contexts[e]:this._contexts[e]=n,this._notifyScopeListeners(),this}setSession(e){return e?this._session=e:delete this._session,this._notifyScopeListeners(),this}getSession(){return this._session}update(e){if(!e)return this;const n=typeof e=="function"?e(this):e,r=n instanceof te?n.getScopeData():dn(n)?e:void 0,{tags:o,attributes:i,extra:c,user:l,contexts:u,level:s,fingerprint:d=[],propagationContext:a,conversationId:f}=r||{};return this._tags={...this._tags,...o},this._attributes={...this._attributes,...i},this._extra={...this._extra,...c},this._contexts={...this._contexts,...u},l&&Object.keys(l).length&&(this._user=l),s&&(this._level=s),d.length&&(this._fingerprint=d),a&&(this._propagationContext=a),f&&(this._conversationId=f),this}clear(){return this._breadcrumbs=[],this._tags={},this._attributes={},this._extra={},this._user={},this._contexts={},this._level=void 0,this._transactionName=void 0,this._fingerprint=void 0,this._session=void 0,this._conversationId=void 0,pt(this,void 0),this._attachments=[],this.setPropagationContext({traceId:ht(),sampleRand:Ye()}),this._notifyScopeListeners(),this}addBreadcrumb(e,n){const r=typeof n=="number"?n:En;if(r<=0)return this;const o={timestamp:Pt(),...e,message:e.message?bn(e.message,2048):e.message};return this._breadcrumbs.push(o),this._breadcrumbs.length>r&&(this._breadcrumbs=this._breadcrumbs.slice(-r),this._client?.recordDroppedEvent("buffer_overflow","log_item")),this._notifyScopeListeners(),this}getLastBreadcrumb(){return this._breadcrumbs[this._breadcrumbs.length-1]}clearBreadcrumbs(){return this._breadcrumbs=[],this._notifyScopeListeners(),this}addAttachment(e){return this._attachments.push(e),this}clearAttachments(){return this._attachments=[],this}getScopeData(){return{breadcrumbs:this._breadcrumbs,attachments:this._attachments,contexts:this._contexts,tags:this._tags,attributes:this._attributes,extra:this._extra,user:this._user,level:this._level,fingerprint:this._fingerprint||[],eventProcessors:this._eventProcessors,propagationContext:this._propagationContext,sdkProcessingMetadata:this._sdkProcessingMetadata,transactionName:this._transactionName,span:gt(this),conversationId:this._conversationId}}setSDKProcessingMetadata(e){return this._sdkProcessingMetadata=Bt(this._sdkProcessingMetadata,e,2),this}setPropagationContext(e){return this._propagationContext=e,this}getPropagationContext(){return this._propagationContext}captureException(e,n){const r=n?.event_id||Se();if(!this._client)return se&&Y.warn("No client configured on scope - will not capture exception!"),r;const o=new Error("Sentry syntheticException");return this._client.captureException(e,{originalException:e,syntheticException:o,...n,event_id:r},this),r}captureMessage(e,n,r){const o=r?.event_id||Se();if(!this._client)return se&&Y.warn("No client configured on scope - will not capture message!"),o;const i=r?.syntheticException??new Error(e);return this._client.captureMessage(e,n,{originalException:e,syntheticException:i,...r,event_id:o},this),o}captureEvent(e,n){const r=e.event_id||n?.event_id||Se();return this._client?(this._client.captureEvent(e,{...n,event_id:r},this),r):(se&&Y.warn("No client configured on scope - will not capture event!"),r)}_notifyScopeListeners(){this._notifyingListeners||(this._notifyingListeners=!0,this._scopeListeners.forEach(e=>{e(this)}),this._notifyingListeners=!1)}}function xn(){return Ne("defaultCurrentScope",()=>new te)}function kn(){return Ne("defaultIsolationScope",()=>new te)}class Ln{constructor(e,n){let r;e?r=e:r=new te;let o;n?o=n:o=new te,this._stack=[{scope:r}],this._isolationScope=o}withScope(e){const n=this._pushScope();let r;try{r=e(n)}catch(o){throw this._popScope(),o}return fn(r)?r.then(o=>(this._popScope(),o),o=>{throw this._popScope(),o}):(this._popScope(),r)}getClient(){return this.getStackTop().client}getScope(){return this.getStackTop().scope}getIsolationScope(){return this._isolationScope}getStackTop(){return this._stack[this._stack.length-1]}_pushScope(){const e=this.getScope().clone();return this._stack.push({client:this.getClient(),scope:e}),e}_popScope(){return this._stack.length<=1?!1:!!this._stack.pop()}}function pe(){const t=et(),e=tt(t);return e.stack=e.stack||new Ln(xn(),kn())}function Tn(t){return pe().withScope(t)}function In(t,e){const n=pe();return n.withScope(()=>(n.getStackTop().scope=t,e(t)))}function mt(t){return pe().withScope(()=>t(pe().getIsolationScope()))}function Dn(){return{withIsolationScope:mt,withScope:Tn,withSetScope:In,withSetIsolationScope:(t,e)=>mt(e),getCurrentScope:()=>pe().getScope(),getIsolationScope:()=>pe().getIsolationScope()}}function Ut(t){const e=tt(t);return e.acs?e.acs:Dn()}function Pe(){const t=et();return Ut(t).getCurrentScope()}function An(){const t=et();return Ut(t).getIsolationScope()}function Rn(){return Ne("globalScope",()=>new te)}function Ce(){return Pe().getClient()}function bt(t){const e=Ce();if(!e){se&&Y.warn(`Cannot add integration "${t.name}" because no SDK Client is available.`);return}e.addIntegration(t)}function Fn(t,e={},n=Pe()){const{message:r,name:o,email:i,url:c,source:l,associatedEventId:u,tags:s}=t,d={contexts:{feedback:{contact_email:i,name:o,message:r,url:c,source:l,associated_event_id:u}},type:"feedback",level:"info",tags:s},a=n?.getClient()||Ce();return a&&a.emit("beforeSendFeedback",d,e),n.captureEvent(d,e)}function Mn(){return typeof __SENTRY_BROWSER_BUNDLE__<"u"&&!!__SENTRY_BROWSER_BUNDLE__}function $n(){return!Mn()&&Object.prototype.toString.call(typeof process<"u"?process:0)==="[object process]"}function Nn(){return typeof window<"u"&&(!$n()||Hn())}function Hn(){return q.process?.type==="renderer"}const G=q,w=G.document,ve=G.navigator,Ot="Report a Bug",Pn="Cancel",Bn="Send Bug Report",Un="Confirm",On="Report a Bug",Wn="your.email@example.org",qn="Email",Vn="What's the bug? What did you expect?",zn="Description",Gn="Your Name",jn="Name",Yn="Thank you for your report!",Zn="(required)",Xn="Add a screenshot",Kn="Remove screenshot",Jn="Highlight",Qn="Hide",er="Remove",tr="widget",nr="api",rr=5e3,or=(t,e={includeReplay:!0})=>{if(!t.message)throw new Error("Unable to submit feedback with empty message");const n=Ce();if(!n)throw new Error("No client setup, cannot send feedback.");t.tags&&Object.keys(t.tags).length&&Pe().setTags(t.tags);const r=Fn({source:nr,url:pn(),...t},e);return new Promise((o,i)=>{const c=setTimeout(()=>i("Unable to determine if Feedback was correctly sent."),3e4),l=n.on("afterSendEvent",(u,s)=>{if(u.event_id===r)return clearTimeout(c),l(),s?.statusCode&&s.statusCode>=200&&s.statusCode<300?o(r):s?.statusCode===403?i("Unable to send feedback. This could be because this domain is not in your list of allowed domains."):i("Unable to send feedback. This could be because of network issues, or because you are using an ad-blocker.")})})},De=typeof __SENTRY_DEBUG__>"u"||__SENTRY_DEBUG__;function ir(){return!(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ve.userAgent)||/Macintosh/i.test(ve.userAgent)&&ve.maxTouchPoints&&ve.maxTouchPoints>1||!isSecureContext)}function Le(t,e){return{...t,...e,tags:{...t.tags,...e.tags},onFormOpen:()=>{e.onFormOpen?.(),t.onFormOpen?.()},onFormClose:()=>{e.onFormClose?.(),t.onFormClose?.()},onSubmitSuccess:(n,r)=>{e.onSubmitSuccess?.(n,r),t.onSubmitSuccess?.(n,r)},onSubmitError:n=>{e.onSubmitError?.(n),t.onSubmitError?.(n)},onFormSubmitted:()=>{e.onFormSubmitted?.(),t.onFormSubmitted?.()},themeDark:{...t.themeDark,...e.themeDark},themeLight:{...t.themeLight,...e.themeLight}}}function ar(t){const e=w.createElement("style");return e.textContent=`
.widget__actor {
  position: fixed;
  z-index: var(--z-index);
  margin: var(--page-margin);
  inset: var(--actor-inset);

  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;

  font-family: inherit;
  font-size: var(--font-size);
  font-weight: 600;
  line-height: 1.14em;
  text-decoration: none;

  background: var(--actor-background, var(--background));
  border-radius: var(--actor-border-radius, 1.7em/50%);
  border: var(--actor-border, var(--border));
  box-shadow: var(--actor-box-shadow, var(--box-shadow));
  color: var(--actor-color, var(--foreground));
  fill: var(--actor-color, var(--foreground));
  cursor: pointer;
  opacity: 1;
  transition: transform 0.2s ease-in-out;
  transform: translate(0, 0) scale(1);
}
.widget__actor[aria-hidden="true"] {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
  transform: translate(0, 16px) scale(0.98);
}

.widget__actor:hover {
  background: var(--actor-hover-background, var(--background));
  filter: var(--interactive-filter);
}

.widget__actor svg {
  width: 1.14em;
  height: 1.14em;
}

@media (max-width: 600px) {
  .widget__actor span {
    display: none;
  }
}
`,t&&e.setAttribute("nonce",t),e}function B(t,e){return Object.entries(e).forEach(([n,r])=>{t.setAttributeNS(null,n,r)}),t}const fe=20,sr="http://www.w3.org/2000/svg";function cr(){const t=l=>G.document.createElementNS(sr,l),e=B(t("svg"),{width:`${fe}`,height:`${fe}`,viewBox:`0 0 ${fe} ${fe}`,fill:"var(--actor-color, var(--foreground))"}),n=B(t("g"),{clipPath:"url(#clip0_57_80)"}),r=B(t("path"),{"fill-rule":"evenodd","clip-rule":"evenodd",d:"M15.6622 15H12.3997C12.2129 14.9959 12.031 14.9396 11.8747 14.8375L8.04965 12.2H7.49956V19.1C7.4875 19.3348 7.3888 19.5568 7.22256 19.723C7.05632 19.8892 6.83435 19.9879 6.59956 20H2.04956C1.80193 19.9968 1.56535 19.8969 1.39023 19.7218C1.21511 19.5467 1.1153 19.3101 1.11206 19.0625V12.2H0.949652C0.824431 12.2017 0.700142 12.1783 0.584123 12.1311C0.468104 12.084 0.362708 12.014 0.274155 11.9255C0.185602 11.8369 0.115689 11.7315 0.0685419 11.6155C0.0213952 11.4995 -0.00202913 11.3752 -0.00034808 11.25V3.75C-0.00900498 3.62067 0.0092504 3.49095 0.0532651 3.36904C0.0972798 3.24712 0.166097 3.13566 0.255372 3.04168C0.344646 2.94771 0.452437 2.87327 0.571937 2.82307C0.691437 2.77286 0.82005 2.74798 0.949652 2.75H8.04965L11.8747 0.1625C12.031 0.0603649 12.2129 0.00407221 12.3997 0H15.6622C15.9098 0.00323746 16.1464 0.103049 16.3215 0.278167C16.4966 0.453286 16.5964 0.689866 16.5997 0.9375V3.25269C17.3969 3.42959 18.1345 3.83026 18.7211 4.41679C19.5322 5.22788 19.9878 6.32796 19.9878 7.47502C19.9878 8.62209 19.5322 9.72217 18.7211 10.5333C18.1345 11.1198 17.3969 11.5205 16.5997 11.6974V14.0125C16.6047 14.1393 16.5842 14.2659 16.5395 14.3847C16.4948 14.5035 16.4268 14.6121 16.3394 14.7042C16.252 14.7962 16.147 14.8698 16.0307 14.9206C15.9144 14.9714 15.7891 14.9984 15.6622 15ZM1.89695 10.325H1.88715V4.625H8.33715C8.52423 4.62301 8.70666 4.56654 8.86215 4.4625L12.6872 1.875H14.7247V13.125H12.6872L8.86215 10.4875C8.70666 10.3835 8.52423 10.327 8.33715 10.325H2.20217C2.15205 10.3167 2.10102 10.3125 2.04956 10.3125C1.9981 10.3125 1.94708 10.3167 1.89695 10.325ZM2.98706 12.2V18.1625H5.66206V12.2H2.98706ZM16.5997 9.93612V5.01393C16.6536 5.02355 16.7072 5.03495 16.7605 5.04814C17.1202 5.13709 17.4556 5.30487 17.7425 5.53934C18.0293 5.77381 18.2605 6.06912 18.4192 6.40389C18.578 6.73866 18.6603 7.10452 18.6603 7.47502C18.6603 7.84552 18.578 8.21139 18.4192 8.54616C18.2605 8.88093 18.0293 9.17624 17.7425 9.41071C17.4556 9.64518 17.1202 9.81296 16.7605 9.90191C16.7072 9.91509 16.6536 9.9265 16.5997 9.93612Z"});e.appendChild(n).appendChild(r);const o=t("defs"),i=B(t("clipPath"),{id:"clip0_57_80"}),c=B(t("rect"),{width:`${fe}`,height:`${fe}`,fill:"white"});return i.appendChild(c),o.appendChild(i),e.appendChild(o).appendChild(i).appendChild(c),e}function lr({triggerLabel:t,triggerAriaLabel:e,shadow:n,styleNonce:r}){const o=w.createElement("button");if(o.type="button",o.className="widget__actor",o.ariaHidden="false",o.ariaLabel=e||t||Ot,o.appendChild(cr()),t){const c=w.createElement("span");c.appendChild(w.createTextNode(t)),o.appendChild(c)}const i=ar(r);return{el:o,appendToDom(){n.appendChild(i),n.appendChild(o)},removeFromDom(){o.remove(),i.remove()},show(){o.ariaHidden="false"},hide(){o.ariaHidden="true"}}}const Wt="rgba(88, 74, 192, 1)",ur={foreground:"#2b2233",background:"#ffffff",accentForeground:"white",accentBackground:Wt,successColor:"#268d75",errorColor:"#df3338",border:"1.5px solid rgba(41, 35, 47, 0.13)",boxShadow:"0px 4px 24px 0px rgba(43, 34, 51, 0.12)",outline:"1px auto var(--accent-background)",interactiveFilter:"brightness(95%)"},vt={foreground:"#ebe6ef",background:"#29232f",accentForeground:"white",accentBackground:Wt,successColor:"#2da98c",errorColor:"#f55459",border:"1.5px solid rgba(235, 230, 239, 0.15)",boxShadow:"0px 4px 24px 0px rgba(43, 34, 51, 0.12)",outline:"1px auto var(--accent-background)",interactiveFilter:"brightness(150%)"};function yt(t){return`
  --foreground: ${t.foreground};
  --background: ${t.background};
  --accent-foreground: ${t.accentForeground};
  --accent-background: ${t.accentBackground};
  --success-color: ${t.successColor};
  --error-color: ${t.errorColor};
  --border: ${t.border};
  --box-shadow: ${t.boxShadow};
  --outline: ${t.outline};
  --interactive-filter: ${t.interactiveFilter};
  `}function St({colorScheme:t,themeDark:e,themeLight:n,styleNonce:r}){const o=w.createElement("style");return o.textContent=`
:host {
  --font-family: system-ui, 'Helvetica Neue', Arial, sans-serif;
  --font-size: 14px;
  --z-index: 100000;

  --page-margin: 16px;
  --inset: auto 0 0 auto;
  --actor-inset: var(--inset);

  font-family: var(--font-family);
  font-size: var(--font-size);

  ${t!=="system"?`color-scheme: only ${t};`:""}

  ${yt(t==="dark"?{...vt,...e}:{...ur,...n})}
}

${t==="system"?`
@media (prefers-color-scheme: dark) {
  :host {
    color-scheme: only dark;

    ${yt({...vt,...e})}
  }
}`:""}
`,r&&o.setAttribute("nonce",r),o}const Zr=({lazyLoadIntegration:t,getModalIntegration:e,getScreenshotIntegration:n})=>(({id:o="sentry-feedback",autoInject:i=!0,showBranding:c=!0,isEmailRequired:l=!1,isNameRequired:u=!1,showEmail:s=!0,showName:d=!0,enableScreenshot:a=!0,useSentryUser:f={email:"email",name:"username"},tags:_,styleNonce:g,scriptNonce:y,colorScheme:v="system",themeLight:h={},themeDark:b={},addScreenshotButtonLabel:A=Xn,cancelButtonLabel:x=Pn,confirmButtonLabel:V=Un,emailLabel:U=qn,emailPlaceholder:F=Wn,formTitle:O=On,isRequiredLabel:T=Zn,messageLabel:$=zn,messagePlaceholder:X=Vn,nameLabel:m=jn,namePlaceholder:S=Gn,removeScreenshotButtonLabel:R=Kn,submitButtonLabel:M=Bn,successMessageText:ne=Yn,triggerLabel:le=Ot,triggerAriaLabel:N="",highlightToolText:H=Jn,hideToolText:D=Qn,removeHighlightText:W=er,onFormOpen:ke,onFormClose:K,onSubmitSuccess:re,onSubmitError:Qt,onFormSubmitted:en}={})=>{const oe={id:o,autoInject:i,showBranding:c,isEmailRequired:l,isNameRequired:u,showEmail:s,showName:d,enableScreenshot:a,useSentryUser:f,tags:_,styleNonce:g,scriptNonce:y,colorScheme:v,themeDark:b,themeLight:h,triggerLabel:le,triggerAriaLabel:N,cancelButtonLabel:x,submitButtonLabel:M,confirmButtonLabel:V,formTitle:O,emailLabel:U,emailPlaceholder:F,messageLabel:$,messagePlaceholder:X,nameLabel:m,namePlaceholder:S,successMessageText:ne,isRequiredLabel:T,addScreenshotButtonLabel:A,removeScreenshotButtonLabel:R,highlightToolText:H,hideToolText:D,removeHighlightText:W,onFormClose:K,onFormOpen:ke,onSubmitError:Qt,onSubmitSuccess:re,onFormSubmitted:en};let j=null,ue=null,be=[];const lt=k=>{if(!j){const I=w.createElement("div");I.id=String(k.id),w.body.appendChild(I),j=I.attachShadow({mode:"open"}),ue=St(k),j.appendChild(ue)}return j},ut=async k=>{const I=k.enableScreenshot&&ir();let J,P;try{J=(e?e():await t("feedbackModalIntegration",y))(),bt(J)}catch{throw De&&Y.error("[Feedback] Error when trying to load feedback integrations. Try using `feedbackSyncIntegration` in your `Sentry.init`."),new Error("[Feedback] Missing feedback modal integration!")}try{const _e=I?n?n():await t("feedbackScreenshotIntegration",y):void 0;_e&&(P=_e(),bt(P))}catch{De&&Y.error("[Feedback] Missing feedback screenshot integration. Proceeding without screenshots.")}const z=J.createDialog({options:{...k,onFormClose:()=>{z?.close(),k.onFormClose?.()},onFormSubmitted:()=>{z?.close(),k.onFormSubmitted?.()}},screenshotIntegration:P,sendFeedback:or,shadow:lt(k)});return z},_t=(k,I={})=>{const J=Le(oe,I),P=typeof k=="string"?w.querySelector(k):typeof k.addEventListener=="function"?k:null;if(!P)throw De&&Y.error("[Feedback] Unable to attach to target element"),new Error("Unable to attach to target element");let z=null;const _e=async()=>{z||(z=await ut({...J,onFormSubmitted:()=>{z?.removeFromDom(),J.onFormSubmitted?.()}})),z.appendToDom(),z.open()};P.addEventListener("click",_e);const Oe=()=>{be=be.filter(tn=>tn!==Oe),z?.removeFromDom(),z=null,P.removeEventListener("click",_e)};return be.push(Oe),Oe},Ue=(k={})=>{const I=Le(oe,k),J=lt(I),P=lr({triggerLabel:I.triggerLabel,triggerAriaLabel:I.triggerAriaLabel,shadow:J,styleNonce:g});return _t(P.el,{...I,onFormOpen(){P.hide()},onFormClose(){P.show()},onFormSubmitted(){P.show()}}),P};return{name:"Feedback",setupOnce(){!Nn()||!oe.autoInject||(w.readyState==="loading"?w.addEventListener("DOMContentLoaded",()=>Ue().appendToDom()):Ue().appendToDom())},attachTo:_t,createWidget(k={}){const I=Ue(Le(oe,k));return I.appendToDom(),I},async createForm(k={}){return ut(Le(oe,k))},setTheme(k){if(oe.colorScheme=k,j){const I=St(oe);ue?j.replaceChild(I,ue):j.prepend(I),ue=I}},remove(){j&&(j.parentElement?.remove(),j=null,ue=null),be.forEach(k=>k()),be=[]}}});function Xr(){return Ce()?.getIntegrationByName("Feedback")}var Be,E,qt,ie,wt,Vt,Xe,we={},ot=[],_r=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,it=Array.isArray;function ee(t,e){for(var n in e)t[n]=e[n];return t}function zt(t){var e=t.parentNode;e&&e.removeChild(t)}function p(t,e,n){var r,o,i,c={};for(i in e)i=="key"?r=e[i]:i=="ref"?o=e[i]:c[i]=e[i];if(arguments.length>2&&(c.children=arguments.length>3?Be.call(arguments,2):n),typeof t=="function"&&t.defaultProps!=null)for(i in t.defaultProps)c[i]===void 0&&(c[i]=t.defaultProps[i]);return Ae(t,c,r,o,null)}function Ae(t,e,n,r,o){var i={type:t,props:e,key:n,ref:r,__k:null,__:null,__b:0,__e:null,__d:void 0,__c:null,constructor:void 0,__v:o??++qt,__i:-1,__u:0};return o==null&&E.vnode!=null&&E.vnode(i),i}function Ee(t){return t.children}function Re(t,e){this.props=t,this.context=e}function ge(t,e){if(e==null)return t.__?ge(t.__,t.__i+1):null;for(var n;e<t.__k.length;e++)if((n=t.__k[e])!=null&&n.__e!=null)return n.__e;return typeof t.type=="function"?ge(t):null}function dr(t,e,n){var r,o=t.__v,i=o.__e,c=t.__P;if(c)return(r=ee({},o)).__v=o.__v+1,E.vnode&&E.vnode(r),at(c,r,o,t.__n,c.ownerSVGElement!==void 0,32&o.__u?[i]:null,e,i??ge(o),!!(32&o.__u),n),r.__.__k[r.__i]=r,r.__d=void 0,r.__e!=i&&Gt(r),r}function Gt(t){var e,n;if((t=t.__)!=null&&t.__c!=null){for(t.__e=t.__c.base=null,e=0;e<t.__k.length;e++)if((n=t.__k[e])!=null&&n.__e!=null){t.__e=t.__c.base=n.__e;break}return Gt(t)}}function Ct(t){(!t.__d&&(t.__d=!0)&&ie.push(t)&&!$e.__r++||wt!==E.debounceRendering)&&((wt=E.debounceRendering)||Vt)($e)}function $e(){var t,e,n,r=[],o=[];for(ie.sort(Xe);t=ie.shift();)t.__d&&(n=ie.length,e=dr(t,r,o)||e,n===0||ie.length>n?(Ke(r,e,o),o.length=r.length=0,e=void 0,ie.sort(Xe)):e&&E.__c&&E.__c(e,ot));e&&Ke(r,e,o),$e.__r=0}function jt(t,e,n,r,o,i,c,l,u,s,d){var a,f,_,g,y,v=r&&r.__k||ot,h=e.length;for(n.__d=u,fr(n,e,v),u=n.__d,a=0;a<h;a++)(_=n.__k[a])!=null&&typeof _!="boolean"&&typeof _!="function"&&(f=_.__i===-1?we:v[_.__i]||we,_.__i=a,at(t,_,f,o,i,c,l,u,s,d),g=_.__e,_.ref&&f.ref!=_.ref&&(f.ref&&st(f.ref,null,_),d.push(_.ref,_.__c||g,_)),y==null&&g!=null&&(y=g),65536&_.__u||f.__k===_.__k?u=Yt(_,u,t):typeof _.type=="function"&&_.__d!==void 0?u=_.__d:g&&(u=g.nextSibling),_.__d=void 0,_.__u&=-196609);n.__d=u,n.__e=y}function fr(t,e,n){var r,o,i,c,l,u=e.length,s=n.length,d=s,a=0;for(t.__k=[],r=0;r<u;r++)(o=t.__k[r]=(o=e[r])==null||typeof o=="boolean"||typeof o=="function"?null:typeof o=="string"||typeof o=="number"||typeof o=="bigint"||o.constructor==String?Ae(null,o,null,null,o):it(o)?Ae(Ee,{children:o},null,null,null):o.constructor===void 0&&o.__b>0?Ae(o.type,o.props,o.key,o.ref?o.ref:null,o.__v):o)!=null?(o.__=t,o.__b=t.__b+1,l=hr(o,n,c=r+a,d),o.__i=l,i=null,l!==-1&&(d--,(i=n[l])&&(i.__u|=131072)),i==null||i.__v===null?(l==-1&&a--,typeof o.type!="function"&&(o.__u|=65536)):l!==c&&(l===c+1?a++:l>c?d>u-c?a+=l-c:a--:a=l<c&&l==c-1?l-c:0,l!==r+a&&(o.__u|=65536))):(i=n[r])&&i.key==null&&i.__e&&(i.__e==t.__d&&(t.__d=ge(i)),Je(i,i,!1),n[r]=null,d--);if(d)for(r=0;r<s;r++)(i=n[r])!=null&&(131072&i.__u)==0&&(i.__e==t.__d&&(t.__d=ge(i)),Je(i,i))}function Yt(t,e,n){var r,o;if(typeof t.type=="function"){for(r=t.__k,o=0;r&&o<r.length;o++)r[o]&&(r[o].__=t,e=Yt(r[o],e,n));return e}t.__e!=e&&(n.insertBefore(t.__e,e||null),e=t.__e);do e=e&&e.nextSibling;while(e!=null&&e.nodeType===8);return e}function hr(t,e,n,r){var o=t.key,i=t.type,c=n-1,l=n+1,u=e[n];if(u===null||u&&o==u.key&&i===u.type)return n;if(r>(u!=null&&(131072&u.__u)==0?1:0))for(;c>=0||l<e.length;){if(c>=0){if((u=e[c])&&(131072&u.__u)==0&&o==u.key&&i===u.type)return c;c--}if(l<e.length){if((u=e[l])&&(131072&u.__u)==0&&o==u.key&&i===u.type)return l;l++}}return-1}function Et(t,e,n){e[0]==="-"?t.setProperty(e,n??""):t[e]=n==null?"":typeof n!="number"||_r.test(e)?n:n+"px"}function Te(t,e,n,r,o){var i;e:if(e==="style")if(typeof n=="string")t.style.cssText=n;else{if(typeof r=="string"&&(t.style.cssText=r=""),r)for(e in r)n&&e in n||Et(t.style,e,"");if(n)for(e in n)r&&n[e]===r[e]||Et(t.style,e,n[e])}else if(e[0]==="o"&&e[1]==="n")i=e!==(e=e.replace(/(PointerCapture)$|Capture$/i,"$1")),e=e.toLowerCase()in t?e.toLowerCase().slice(2):e.slice(2),t.l||(t.l={}),t.l[e+i]=n,n?r?n.u=r.u:(n.u=Date.now(),t.addEventListener(e,i?kt:xt,i)):t.removeEventListener(e,i?kt:xt,i);else{if(o)e=e.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(e!=="width"&&e!=="height"&&e!=="href"&&e!=="list"&&e!=="form"&&e!=="tabIndex"&&e!=="download"&&e!=="rowSpan"&&e!=="colSpan"&&e!=="role"&&e in t)try{t[e]=n??"";break e}catch{}typeof n=="function"||(n==null||n===!1&&e[4]!=="-"?t.removeAttribute(e):t.setAttribute(e,n))}}function xt(t){if(this.l){var e=this.l[t.type+!1];if(t.t){if(t.t<=e.u)return}else t.t=Date.now();return e(E.event?E.event(t):t)}}function kt(t){if(this.l)return this.l[t.type+!0](E.event?E.event(t):t)}function at(t,e,n,r,o,i,c,l,u,s){var d,a,f,_,g,y,v,h,b,A,x,V,U,F,O,T=e.type;if(e.constructor!==void 0)return null;128&n.__u&&(u=!!(32&n.__u),i=[l=e.__e=n.__e]),(d=E.__b)&&d(e);e:if(typeof T=="function")try{if(h=e.props,b=(d=T.contextType)&&r[d.__c],A=d?b?b.props.value:d.__:r,n.__c?v=(a=e.__c=n.__c).__=a.__E:("prototype"in T&&T.prototype.render?e.__c=a=new T(h,A):(e.__c=a=new Re(h,A),a.constructor=T,a.render=gr),b&&b.sub(a),a.props=h,a.state||(a.state={}),a.context=A,a.__n=r,f=a.__d=!0,a.__h=[],a._sb=[]),a.__s==null&&(a.__s=a.state),T.getDerivedStateFromProps!=null&&(a.__s==a.state&&(a.__s=ee({},a.__s)),ee(a.__s,T.getDerivedStateFromProps(h,a.__s))),_=a.props,g=a.state,a.__v=e,f)T.getDerivedStateFromProps==null&&a.componentWillMount!=null&&a.componentWillMount(),a.componentDidMount!=null&&a.__h.push(a.componentDidMount);else{if(T.getDerivedStateFromProps==null&&h!==_&&a.componentWillReceiveProps!=null&&a.componentWillReceiveProps(h,A),!a.__e&&(a.shouldComponentUpdate!=null&&a.shouldComponentUpdate(h,a.__s,A)===!1||e.__v===n.__v)){for(e.__v!==n.__v&&(a.props=h,a.state=a.__s,a.__d=!1),e.__e=n.__e,e.__k=n.__k,e.__k.forEach(function($){$&&($.__=e)}),x=0;x<a._sb.length;x++)a.__h.push(a._sb[x]);a._sb=[],a.__h.length&&c.push(a);break e}a.componentWillUpdate!=null&&a.componentWillUpdate(h,a.__s,A),a.componentDidUpdate!=null&&a.__h.push(function(){a.componentDidUpdate(_,g,y)})}if(a.context=A,a.props=h,a.__P=t,a.__e=!1,V=E.__r,U=0,"prototype"in T&&T.prototype.render){for(a.state=a.__s,a.__d=!1,V&&V(e),d=a.render(a.props,a.state,a.context),F=0;F<a._sb.length;F++)a.__h.push(a._sb[F]);a._sb=[]}else do a.__d=!1,V&&V(e),d=a.render(a.props,a.state,a.context),a.state=a.__s;while(a.__d&&++U<25);a.state=a.__s,a.getChildContext!=null&&(r=ee(ee({},r),a.getChildContext())),f||a.getSnapshotBeforeUpdate==null||(y=a.getSnapshotBeforeUpdate(_,g)),jt(t,it(O=d!=null&&d.type===Ee&&d.key==null?d.props.children:d)?O:[O],e,n,r,o,i,c,l,u,s),a.base=e.__e,e.__u&=-161,a.__h.length&&c.push(a),v&&(a.__E=a.__=null)}catch($){e.__v=null,u||i!=null?(e.__e=l,e.__u|=u?160:32,i[i.indexOf(l)]=null):(e.__e=n.__e,e.__k=n.__k),E.__e($,e,n)}else i==null&&e.__v===n.__v?(e.__k=n.__k,e.__e=n.__e):e.__e=pr(n.__e,e,n,r,o,i,c,u,s);(d=E.diffed)&&d(e)}function Ke(t,e,n){for(var r=0;r<n.length;r++)st(n[r],n[++r],n[++r]);E.__c&&E.__c(e,t),t.some(function(o){try{t=o.__h,o.__h=[],t.some(function(i){i.call(o)})}catch(i){E.__e(i,o.__v)}})}function pr(t,e,n,r,o,i,c,l,u){var s,d,a,f,_,g,y,v=n.props,h=e.props,b=e.type;if(b==="svg"&&(o=!0),i!=null){for(s=0;s<i.length;s++)if((_=i[s])&&"setAttribute"in _==!!b&&(b?_.localName===b:_.nodeType===3)){t=_,i[s]=null;break}}if(t==null){if(b===null)return document.createTextNode(h);t=o?document.createElementNS("http://www.w3.org/2000/svg",b):document.createElement(b,h.is&&h),i=null,l=!1}if(b===null)v===h||l&&t.data===h||(t.data=h);else{if(i=i&&Be.call(t.childNodes),v=n.props||we,!l&&i!=null)for(v={},s=0;s<t.attributes.length;s++)v[(_=t.attributes[s]).name]=_.value;for(s in v)_=v[s],s=="children"||(s=="dangerouslySetInnerHTML"?a=_:s==="key"||s in h||Te(t,s,null,_,o));for(s in h)_=h[s],s=="children"?f=_:s=="dangerouslySetInnerHTML"?d=_:s=="value"?g=_:s=="checked"?y=_:s==="key"||l&&typeof _!="function"||v[s]===_||Te(t,s,_,v[s],o);if(d)l||a&&(d.__html===a.__html||d.__html===t.innerHTML)||(t.innerHTML=d.__html),e.__k=[];else if(a&&(t.innerHTML=""),jt(t,it(f)?f:[f],e,n,r,o&&b!=="foreignObject",i,c,i?i[0]:n.__k&&ge(n,0),l,u),i!=null)for(s=i.length;s--;)i[s]!=null&&zt(i[s]);l||(s="value",g!==void 0&&(g!==t[s]||b==="progress"&&!g||b==="option"&&g!==v[s])&&Te(t,s,g,v[s],!1),s="checked",y!==void 0&&y!==t[s]&&Te(t,s,y,v[s],!1))}return t}function st(t,e,n){try{typeof t=="function"?t(e):t.current=e}catch(r){E.__e(r,n)}}function Je(t,e,n){var r,o;if(E.unmount&&E.unmount(t),(r=t.ref)&&(r.current&&r.current!==t.__e||st(r,null,e)),(r=t.__c)!=null){if(r.componentWillUnmount)try{r.componentWillUnmount()}catch(i){E.__e(i,e)}r.base=r.__P=null,t.__c=void 0}if(r=t.__k)for(o=0;o<r.length;o++)r[o]&&Je(r[o],e,n||typeof t.type!="function");n||t.__e==null||zt(t.__e),t.__=t.__e=t.__d=void 0}function gr(t,e,n){return this.constructor(t,n)}function mr(t,e,n){var r,o,i,c;E.__&&E.__(t,e),o=(r=!1)?null:e.__k,i=[],c=[],at(e,t=e.__k=p(Ee,null,[t]),o||we,we,e.ownerSVGElement!==void 0,o?null:e.firstChild?Be.call(e.childNodes):null,i,o?o.__e:e.firstChild,r,c),t.__d=void 0,Ke(i,t,c)}Be=ot.slice,E={__e:function(t,e,n,r){for(var o,i,c;e=e.__;)if((o=e.__c)&&!o.__)try{if((i=o.constructor)&&i.getDerivedStateFromError!=null&&(o.setState(i.getDerivedStateFromError(t)),c=o.__d),o.componentDidCatch!=null&&(o.componentDidCatch(t,r||{}),c=o.__d),c)return o.__E=o}catch(l){t=l}throw t}},qt=0,Re.prototype.setState=function(t,e){var n;n=this.__s!=null&&this.__s!==this.state?this.__s:this.__s=ee({},this.state),typeof t=="function"&&(t=t(ee({},n),this.props)),t&&ee(n,t),t!=null&&this.__v&&(e&&this._sb.push(e),Ct(this))},Re.prototype.forceUpdate=function(t){this.__v&&(this.__e=!0,t&&this.__h.push(t),Ct(this))},Re.prototype.render=Ee,ie=[],Vt=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Xe=function(t,e){return t.__v.__b-e.__v.__b},$e.__r=0;var Z,C,qe,Lt,me=0,Zt=[],Fe=[],L=E,Tt=L.__b,It=L.__r,Dt=L.diffed,At=L.__c,Rt=L.unmount,Ft=L.__;function ce(t,e){L.__h&&L.__h(C,t,me||e),me=0;var n=C.__H||(C.__H={__:[],__h:[]});return t>=n.__.length&&n.__.push({__V:Fe}),n.__[t]}function ae(t){return me=1,Xt(Jt,t)}function Xt(t,e,n){var r=ce(Z++,2);if(r.t=t,!r.__c&&(r.__=[n?n(e):Jt(void 0,e),function(l){var u=r.__N?r.__N[0]:r.__[0],s=r.t(u,l);u!==s&&(r.__N=[s,r.__[1]],r.__c.setState({}))}],r.__c=C,!C.u)){var o=function(l,u,s){if(!r.__c.__H)return!0;var d=r.__c.__H.__.filter(function(f){return!!f.__c});if(d.every(function(f){return!f.__N}))return!i||i.call(this,l,u,s);var a=!1;return d.forEach(function(f){if(f.__N){var _=f.__[0];f.__=f.__N,f.__N=void 0,_!==f.__[0]&&(a=!0)}}),!(!a&&r.__c.props===l)&&(!i||i.call(this,l,u,s))};C.u=!0;var i=C.shouldComponentUpdate,c=C.componentWillUpdate;C.componentWillUpdate=function(l,u,s){if(this.__e){var d=i;i=void 0,o(l,u,s),i=d}c&&c.call(this,l,u,s)},C.shouldComponentUpdate=o}return r.__N||r.__}function br(t,e){var n=ce(Z++,3);!L.__s&&ct(n.__H,e)&&(n.__=t,n.i=e,C.__H.__h.push(n))}function Kt(t,e){var n=ce(Z++,4);!L.__s&&ct(n.__H,e)&&(n.__=t,n.i=e,C.__h.push(n))}function vr(t){return me=5,xe(function(){return{current:t}},[])}function yr(t,e,n){me=6,Kt(function(){return typeof t=="function"?(t(e()),function(){return t(null)}):t?(t.current=e(),function(){return t.current=null}):void 0},n==null?n:n.concat(t))}function xe(t,e){var n=ce(Z++,7);return ct(n.__H,e)?(n.__V=t(),n.i=e,n.__h=t,n.__V):n.__}function he(t,e){return me=8,xe(function(){return t},e)}function Sr(t){var e=C.context[t.__c],n=ce(Z++,9);return n.c=t,e?(n.__==null&&(n.__=!0,e.sub(C)),e.props.value):t.__}function wr(t,e){L.useDebugValue&&L.useDebugValue(e?e(t):t)}function Cr(t){var e=ce(Z++,10),n=ae();return e.__=t,C.componentDidCatch||(C.componentDidCatch=function(r,o){e.__&&e.__(r,o),n[1](r)}),[n[0],function(){n[1](void 0)}]}function Er(){var t=ce(Z++,11);if(!t.__){for(var e=C.__v;e!==null&&!e.__m&&e.__!==null;)e=e.__;var n=e.__m||(e.__m=[0,0]);t.__="P"+n[0]+"-"+n[1]++}return t.__}function xr(){for(var t;t=Zt.shift();)if(t.__P&&t.__H)try{t.__H.__h.forEach(Me),t.__H.__h.forEach(Qe),t.__H.__h=[]}catch(e){t.__H.__h=[],L.__e(e,t.__v)}}L.__b=function(t){C=null,Tt&&Tt(t)},L.__=function(t,e){e.__k&&e.__k.__m&&(t.__m=e.__k.__m),Ft&&Ft(t,e)},L.__r=function(t){It&&It(t),Z=0;var e=(C=t.__c).__H;e&&(qe===C?(e.__h=[],C.__h=[],e.__.forEach(function(n){n.__N&&(n.__=n.__N),n.__V=Fe,n.__N=n.i=void 0})):(e.__h.forEach(Me),e.__h.forEach(Qe),e.__h=[],Z=0)),qe=C},L.diffed=function(t){Dt&&Dt(t);var e=t.__c;e&&e.__H&&(e.__H.__h.length&&(Zt.push(e)!==1&&Lt===L.requestAnimationFrame||((Lt=L.requestAnimationFrame)||kr)(xr)),e.__H.__.forEach(function(n){n.i&&(n.__H=n.i),n.__V!==Fe&&(n.__=n.__V),n.i=void 0,n.__V=Fe})),qe=C=null},L.__c=function(t,e){e.some(function(n){try{n.__h.forEach(Me),n.__h=n.__h.filter(function(r){return!r.__||Qe(r)})}catch(r){e.some(function(o){o.__h&&(o.__h=[])}),e=[],L.__e(r,n.__v)}}),At&&At(t,e)},L.unmount=function(t){Rt&&Rt(t);var e,n=t.__c;n&&n.__H&&(n.__H.__.forEach(function(r){try{Me(r)}catch(o){e=o}}),n.__H=void 0,e&&L.__e(e,n.__v))};var Mt=typeof requestAnimationFrame=="function";function kr(t){var e,n=function(){clearTimeout(r),Mt&&cancelAnimationFrame(e),setTimeout(t)},r=setTimeout(n,100);Mt&&(e=requestAnimationFrame(n))}function Me(t){var e=C,n=t.__c;typeof n=="function"&&(t.__c=void 0,n()),C=e}function Qe(t){var e=C;t.__c=t.__(),C=e}function ct(t,e){return!t||t.length!==e.length||e.some(function(n,r){return n!==t[r]})}function Jt(t,e){return typeof e=="function"?e(t):e}const Lr=Object.defineProperty({__proto__:null,useCallback:he,useContext:Sr,useDebugValue:wr,useEffect:br,useErrorBoundary:Cr,useId:Er,useImperativeHandle:yr,useLayoutEffect:Kt,useMemo:xe,useReducer:Xt,useRef:vr,useState:ae},Symbol.toStringTag,{value:"Module"}),Tr="http://www.w3.org/2000/svg";function Ir(){const t=r=>w.createElementNS(Tr,r),e=B(t("svg"),{width:"32",height:"30",viewBox:"0 0 72 66",fill:"inherit"}),n=B(t("path"),{transform:"translate(11, 11)",d:"M29,2.26a4.67,4.67,0,0,0-8,0L14.42,13.53A32.21,32.21,0,0,1,32.17,40.19H27.55A27.68,27.68,0,0,0,12.09,17.47L6,28a15.92,15.92,0,0,1,9.23,12.17H4.62A.76.76,0,0,1,4,39.06l2.94-5a10.74,10.74,0,0,0-3.36-1.9l-2.91,5a4.54,4.54,0,0,0,1.69,6.24A4.66,4.66,0,0,0,4.62,44H19.15a19.4,19.4,0,0,0-8-17.31l2.31-4A23.87,23.87,0,0,1,23.76,44H36.07a35.88,35.88,0,0,0-16.41-31.8l4.67-8a.77.77,0,0,1,1.05-.27c.53.29,20.29,34.77,20.66,35.17a.76.76,0,0,1-.68,1.13H40.6q.09,1.91,0,3.81h4.78A4.59,4.59,0,0,0,50,39.43a4.49,4.49,0,0,0-.62-2.28Z"});return e.appendChild(n),e}function Dr({options:t}){const e=xe(()=>({__html:Ir().outerHTML}),[]);return p("h2",{class:"dialog__header"},p("span",{class:"dialog__title"},t.formTitle),t.showBranding?p("a",{class:"brand-link",target:"_blank",href:"https://sentry.io/welcome/",title:"Powered by Sentry",rel:"noopener noreferrer",dangerouslySetInnerHTML:e}):null)}function Ar(t,e){const n=[];return e.isNameRequired&&!t.name&&n.push(e.nameLabel),e.isEmailRequired&&!t.email&&n.push(e.emailLabel),t.message||n.push(e.messageLabel),n}function Ve(t,e){const n=t.get(e);return typeof n=="string"?n.trim():""}function Rr({options:t,defaultEmail:e,defaultName:n,onFormClose:r,onSubmit:o,onSubmitSuccess:i,onSubmitError:c,showEmail:l,showName:u,screenshotInput:s}){const{tags:d,addScreenshotButtonLabel:a,removeScreenshotButtonLabel:f,cancelButtonLabel:_,emailLabel:g,emailPlaceholder:y,isEmailRequired:v,isNameRequired:h,messageLabel:b,messagePlaceholder:A,nameLabel:x,namePlaceholder:V,submitButtonLabel:U,isRequiredLabel:F}=t,[O,T]=ae(!1),[$,X]=ae(null),[m,S]=ae(!1),R=s?.input,[M,ne]=ae(null),le=he(D=>{ne(D),S(!1)},[]),N=he(D=>{const W=Ar(D,{emailLabel:g,isEmailRequired:v,isNameRequired:h,messageLabel:b,nameLabel:x});return W.length>0?X(`Please enter in the following required fields: ${W.join(", ")}`):X(null),W.length===0},[g,v,h,b,x]),H=he(async D=>{T(!0);try{if(D.preventDefault(),!(D.target instanceof HTMLFormElement))return;const W=new FormData(D.target),ke=await(s&&m?s.value():void 0),K={name:Ve(W,"name"),email:Ve(W,"email"),message:Ve(W,"message"),attachments:ke?[ke]:void 0};if(!N(K))return;try{const re=await o({name:K.name,email:K.email,message:K.message,source:tr,tags:d},{attachments:K.attachments});i(K,re)}catch(re){De&&Y.error(re),X(re),c(re)}}finally{T(!1)}},[s&&m,i,c]);return p("form",{class:"form",onSubmit:H},R&&m?p(R,{onError:le}):null,p("fieldset",{class:"form__right","data-sentry-feedback":!0,disabled:O},p("div",{class:"form__top"},$?p("div",{class:"form__error-container"},$):null,u?p("label",{for:"name",class:"form__label"},p(ze,{label:x,isRequiredLabel:F,isRequired:h}),p("input",{class:"form__input",defaultValue:n,id:"name",name:"name",placeholder:V,required:h,type:"text"})):p("input",{"aria-hidden":!0,value:n,name:"name",type:"hidden"}),l?p("label",{for:"email",class:"form__label"},p(ze,{label:g,isRequiredLabel:F,isRequired:v}),p("input",{class:"form__input",defaultValue:e,id:"email",name:"email",placeholder:y,required:v,type:"email"})):p("input",{"aria-hidden":!0,value:e,name:"email",type:"hidden"}),p("label",{for:"message",class:"form__label"},p(ze,{label:b,isRequiredLabel:F,isRequired:!0}),p("textarea",{autoFocus:!0,class:"form__input form__input--textarea",id:"message",name:"message",placeholder:A,required:!0,rows:5})),R?p("label",{for:"screenshot",class:"form__label"},p("button",{class:"btn btn--default",disabled:O,type:"button",onClick:()=>{ne(null),S(D=>!D)}},m?f:a),M?p("div",{class:"form__error-container"},M.message):null):null),p("div",{class:"btn-group"},p("button",{class:"btn btn--primary",disabled:O,type:"submit"},U),p("button",{class:"btn btn--default",disabled:O,type:"button",onClick:r},_))))}function ze({label:t,isRequired:e,isRequiredLabel:n}){return p("span",{class:"form__label__text"},t,e&&p("span",{class:"form__label__text--required"},n))}const Ie=16,$t=17,Fr="http://www.w3.org/2000/svg";function Mr(){const t=u=>G.document.createElementNS(Fr,u),e=B(t("svg"),{width:`${Ie}`,height:`${$t}`,viewBox:`0 0 ${Ie} ${$t}`,fill:"inherit"}),n=B(t("g"),{clipPath:"url(#clip0_57_156)"}),r=B(t("path"),{"fill-rule":"evenodd","clip-rule":"evenodd",d:"M3.55544 15.1518C4.87103 16.0308 6.41775 16.5 8 16.5C10.1217 16.5 12.1566 15.6571 13.6569 14.1569C15.1571 12.6566 16 10.6217 16 8.5C16 6.91775 15.5308 5.37103 14.6518 4.05544C13.7727 2.73985 12.5233 1.71447 11.0615 1.10897C9.59966 0.503466 7.99113 0.34504 6.43928 0.653721C4.88743 0.962403 3.46197 1.72433 2.34315 2.84315C1.22433 3.96197 0.462403 5.38743 0.153721 6.93928C-0.15496 8.49113 0.00346625 10.0997 0.608967 11.5615C1.21447 13.0233 2.23985 14.2727 3.55544 15.1518ZM4.40546 3.1204C5.46945 2.40946 6.72036 2.03 8 2.03C9.71595 2.03 11.3616 2.71166 12.575 3.92502C13.7883 5.13838 14.47 6.78405 14.47 8.5C14.47 9.77965 14.0905 11.0306 13.3796 12.0945C12.6687 13.1585 11.6582 13.9878 10.476 14.4775C9.29373 14.9672 7.99283 15.0953 6.73777 14.8457C5.48271 14.596 4.32987 13.9798 3.42502 13.075C2.52018 12.1701 1.90397 11.0173 1.65432 9.76224C1.40468 8.50718 1.5328 7.20628 2.0225 6.02404C2.5122 4.8418 3.34148 3.83133 4.40546 3.1204Z"}),o=B(t("path"),{d:"M6.68775 12.4297C6.78586 12.4745 6.89218 12.4984 7 12.5C7.11275 12.4955 7.22315 12.4664 7.32337 12.4145C7.4236 12.3627 7.51121 12.2894 7.58 12.2L12 5.63999C12.0848 5.47724 12.1071 5.28902 12.0625 5.11098C12.0178 4.93294 11.9095 4.77744 11.7579 4.67392C11.6064 4.57041 11.4221 4.52608 11.24 4.54931C11.0579 4.57254 10.8907 4.66173 10.77 4.79999L6.88 10.57L5.13 8.56999C5.06508 8.49566 4.98613 8.43488 4.89768 8.39111C4.80922 8.34735 4.713 8.32148 4.61453 8.31498C4.51605 8.30847 4.41727 8.32147 4.32382 8.35322C4.23038 8.38497 4.14413 8.43484 4.07 8.49999C3.92511 8.63217 3.83692 8.81523 3.82387 9.01092C3.81083 9.2066 3.87393 9.39976 4 9.54999L6.43 12.24C6.50187 12.3204 6.58964 12.385 6.68775 12.4297Z"});e.appendChild(n).append(o,r);const i=t("defs"),c=B(t("clipPath"),{id:"clip0_57_156"}),l=B(t("rect"),{width:`${Ie}`,height:`${Ie}`,fill:"white",transform:"translate(0 0.5)"});return c.appendChild(l),i.appendChild(c),e.appendChild(i).appendChild(c).appendChild(l),e}function $r({open:t,onFormSubmitted:e,...n}){const r=n.options,o=xe(()=>({__html:Mr().outerHTML}),[]),[i,c]=ae(null),l=he(()=>{i&&(clearTimeout(i),c(null)),e()},[i]),u=he((s,d)=>{n.onSubmitSuccess(s,d),c(setTimeout(()=>{e(),c(null)},rr))},[e]);return p(Ee,null,i?p("div",{class:"success__position",onClick:l},p("div",{class:"success__content"},r.successMessageText,p("span",{class:"success__icon",dangerouslySetInnerHTML:o}))):p("dialog",{class:"dialog",onClick:r.onFormClose,open:t},p("div",{class:"dialog__position"},p("div",{class:"dialog__content",onClick:s=>{s.stopPropagation()}},p(Dr,{options:r}),p(Rr,{...n,onSubmitSuccess:u})))))}const Nr=`
.dialog {
  position: fixed;
  z-index: var(--z-index);
  margin: 0;
  inset: 0;

  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  height: 100vh;
  width: 100vw;

  color: var(--dialog-color, var(--foreground));
  fill: var(--dialog-color, var(--foreground));
  line-height: 1.75em;

  background-color: rgba(0, 0, 0, 0.05);
  border: none;
  inset: 0;
  opacity: 1;
  transition: opacity 0.2s ease-in-out;
}

.dialog__position {
  position: fixed;
  z-index: var(--z-index);
  inset: var(--dialog-inset);
  padding: var(--page-margin);
  display: flex;
  max-height: calc(100vh - (2 * var(--page-margin)));
}
@media (max-width: 600px) {
  .dialog__position {
    inset: var(--page-margin);
    padding: 0;
  }
}

.dialog__position:has(.editor) {
  inset: var(--page-margin);
  padding: 0;
}

.dialog:not([open]) {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}
.dialog:not([open]) .dialog__content {
  transform: translate(0, -16px) scale(0.98);
}

.dialog__content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: var(--dialog-padding, 24px);
  max-width: 100%;
  width: 100%;
  max-height: 100%;
  overflow: auto;

  background: var(--dialog-background, var(--background));
  border-radius: var(--dialog-border-radius, 20px);
  border: var(--dialog-border, var(--border));
  box-shadow: var(--dialog-box-shadow, var(--box-shadow));
  transform: translate(0, 0) scale(1);
  transition: transform 0.2s ease-in-out;
}

`,Hr=`
.dialog__header {
  display: flex;
  gap: 4px;
  justify-content: space-between;
  font-weight: var(--dialog-header-weight, 600);
  margin: 0;
}
.dialog__title {
  align-self: center;
  width: var(--form-width, 272px);
}

@media (max-width: 600px) {
  .dialog__title {
    width: auto;
  }
}

.dialog__position:has(.editor) .dialog__title {
  width: auto;
}


.brand-link {
  display: inline-flex;
}
.brand-link:focus-visible {
  outline: var(--outline);
}
`,Pr=`
.form {
  display: flex;
  overflow: auto;
  flex-direction: row;
  gap: 16px;
  flex: 1 0;
}

.form fieldset {
  border: none;
  margin: 0;
  padding: 0;
}

.form__right {
  flex: 0 0 auto;
  display: flex;
  overflow: auto;
  flex-direction: column;
  justify-content: space-between;
  gap: 20px;
  width: var(--form-width, 100%);
}

.dialog__position:has(.editor) .form__right {
  width: var(--form-width, 272px);
}

.form__top {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form__error-container {
  color: var(--error-color);
  fill: var(--error-color);
}

.form__label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0px;
}

.form__label__text {
  display: flex;
  gap: 4px;
  align-items: center;
}

.form__label__text--required {
  font-size: 0.85em;
}

.form__input {
  font-family: inherit;
  line-height: inherit;
  background: transparent;
  box-sizing: border-box;
  border: var(--input-border, var(--border));
  border-radius: var(--input-border-radius, 6px);
  color: var(--input-color, inherit);
  fill: var(--input-color, inherit);
  font-size: var(--input-font-size, inherit);
  font-weight: var(--input-font-weight, 500);
  padding: 6px 12px;
}

.form__input::placeholder {
  opacity: 0.65;
  color: var(--input-placeholder-color, inherit);
  filter: var(--interactive-filter);
}

.form__input:focus-visible {
  outline: var(--input-focus-outline, var(--outline));
}

.form__input--textarea {
  font-family: inherit;
  resize: vertical;
}

.error {
  color: var(--error-color);
  fill: var(--error-color);
}
`,Br=`
.btn-group {
  display: grid;
  gap: 8px;
}

.btn {
  line-height: inherit;
  border: var(--button-border, var(--border));
  border-radius: var(--button-border-radius, 6px);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--button-font-size, inherit);
  font-weight: var(--button-font-weight, 600);
  padding: var(--button-padding, 6px 16px);
}
.btn[disabled] {
  opacity: 0.6;
  pointer-events: none;
}

.btn--primary {
  color: var(--button-primary-color, var(--accent-foreground));
  fill: var(--button-primary-color, var(--accent-foreground));
  background: var(--button-primary-background, var(--accent-background));
  border: var(--button-primary-border, var(--border));
  border-radius: var(--button-primary-border-radius, 6px);
  font-weight: var(--button-primary-font-weight, 500);
}
.btn--primary:hover {
  color: var(--button-primary-hover-color, var(--accent-foreground));
  fill: var(--button-primary-hover-color, var(--accent-foreground));
  background: var(--button-primary-hover-background, var(--accent-background));
  filter: var(--interactive-filter);
}
.btn--primary:focus-visible {
  background: var(--button-primary-hover-background, var(--accent-background));
  filter: var(--interactive-filter);
  outline: var(--button-primary-focus-outline, var(--outline));
}

.btn--default {
  color: var(--button-color, var(--foreground));
  fill: var(--button-color, var(--foreground));
  background: var(--button-background, var(--background));
  border: var(--button-border, var(--border));
  border-radius: var(--button-border-radius, 6px);
  font-weight: var(--button-font-weight, 500);
}
.btn--default:hover {
  color: var(--button-color, var(--foreground));
  fill: var(--button-color, var(--foreground));
  background: var(--button-hover-background, var(--background));
  filter: var(--interactive-filter);
}
.btn--default:focus-visible {
  background: var(--button-hover-background, var(--background));
  filter: var(--interactive-filter);
  outline: var(--button-focus-outline, var(--outline));
}
`,Ur=`
.success__position {
  position: fixed;
  inset: var(--dialog-inset);
  padding: var(--page-margin);
  z-index: var(--z-index);
}
.success__content {
  background: var(--success-background, var(--background));
  border: var(--success-border, var(--border));
  border-radius: var(--success-border-radius, 1.7em/50%);
  box-shadow: var(--success-box-shadow, var(--box-shadow));
  font-weight: var(--success-font-weight, 600);
  color: var(--success-color);
  fill: var(--success-color);
  padding: 12px 24px;
  line-height: 1.75em;

  display: grid;
  align-items: center;
  grid-auto-flow: column;
  gap: 6px;
  cursor: default;
}

.success__icon {
  display: flex;
}
`;function Or(t){const e=w.createElement("style");return e.textContent=`
:host {
  --dialog-inset: var(--inset);
}

${Nr}
${Hr}
${Pr}
${Br}
${Ur}
`,t&&e.setAttribute("nonce",t),e}function Wr(){const t=Pe().getUser(),e=An().getUser(),n=Rn().getUser();return t&&Object.keys(t).length?t:e&&Object.keys(e).length?e:n}const Kr=(()=>({name:"FeedbackModal",setupOnce(){},createDialog:({options:t,screenshotIntegration:e,sendFeedback:n,shadow:r})=>{const o=r,i=t.useSentryUser,c=Wr(),l=w.createElement("div"),u=Or(t.styleNonce);let s="";const d={get el(){return l},appendToDom(){!o.contains(u)&&!o.contains(l)&&(o.appendChild(u),o.appendChild(l))},removeFromDom(){l.remove(),u.remove(),w.body.style.overflow=s},open(){f(!0),t.onFormOpen?.(),Ce()?.emit("openFeedbackWidget"),s=w.body.style.overflow,w.body.style.overflow="hidden"},close(){f(!1),w.body.style.overflow=s}},a=e?.createInput({h:p,hooks:Lr,dialog:d,options:t}),f=_=>{mr(p($r,{options:t,screenshotInput:a,showName:t.showName||t.isNameRequired,showEmail:t.showEmail||t.isEmailRequired,defaultName:String(i&&c?.[i.name]||""),defaultEmail:String(i&&c?.[i.email]||""),onFormClose:()=>{f(!1),t.onFormClose?.()},onSubmit:n,onSubmitSuccess:(g,y)=>{f(!1),t.onSubmitSuccess?.(g,y)},onSubmitError:g=>{t.onSubmitError?.(g)},onFormSubmitted:()=>{t.onFormSubmitted?.()},open:_}),l)};return d}}));function qr({h:t}){return function(){return t("svg",{"data-test-id":"icon-close",viewBox:"0 0 16 16",fill:"#2B2233",height:"25px",width:"25px"},t("circle",{r:"7",cx:"8",cy:"8",fill:"white"}),t("path",{strokeWidth:"1.5",d:"M8,16a8,8,0,1,1,8-8A8,8,0,0,1,8,16ZM8,1.53A6.47,6.47,0,1,0,14.47,8,6.47,6.47,0,0,0,8,1.53Z"}),t("path",{strokeWidth:"1.5",d:"M5.34,11.41a.71.71,0,0,1-.53-.22.74.74,0,0,1,0-1.06l5.32-5.32a.75.75,0,0,1,1.06,1.06L5.87,11.19A.74.74,0,0,1,5.34,11.41Z"}),t("path",{strokeWidth:"1.5",d:"M10.66,11.41a.74.74,0,0,1-.53-.22L4.81,5.87A.75.75,0,0,1,5.87,4.81l5.32,5.32a.74.74,0,0,1,0,1.06A.71.71,0,0,1,10.66,11.41Z"}))}}function Vr(t){const e=w.createElement("style"),n="#1A141F",r="#302735";return e.textContent=`
.editor {
  display: flex;
  flex-grow: 1;
  flex-direction: column;
}

.editor__image-container {
  justify-items: center;
  padding: 15px;
  position: relative;
  height: 100%;
  border-radius: var(--menu-border-radius, 6px);

  background-color: ${n};
  background-image: repeating-linear-gradient(
      -145deg,
      transparent,
      transparent 8px,
      ${n} 8px,
      ${n} 11px
    ),
    repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 15px,
      ${r} 15px,
      ${r} 16px
    );
}

.editor__canvas-container {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.editor__canvas-container > * {
  object-fit: contain;
  position: absolute;
}

.editor__tool-container {
  padding-top: 8px;
  display: flex;
  justify-content: center;
}

.editor__tool-bar {
  display: flex;
  gap: 8px;
}

.editor__tool {
  display: flex;
  padding: 8px 12px;
  justify-content: center;
  align-items: center;
  border: var(--button-border, var(--border));
  border-radius: var(--button-border-radius, 6px);
  background: var(--button-background, var(--background));
  color: var(--button-color, var(--foreground));
}

.editor__tool--active {
  background: var(--button-primary-background, var(--accent-background));
  color: var(--button-primary-color, var(--accent-foreground));
}

.editor__rect {
  position: absolute;
  z-index: 2;
}

.editor__rect button {
  opacity: 0;
  position: absolute;
  top: -12px;
  right: -12px;
  cursor: pointer;
  padding: 0;
  z-index: 3;
  border: none;
  background: none;
}

.editor__rect:hover button {
  opacity: 1;
}
`,t&&e.setAttribute("nonce",t),e}function zr({h:t}){return function({action:n,setAction:r,options:o}){return t("div",{class:"editor__tool-container"},t("div",{class:"editor__tool-bar"},t("button",{type:"button",class:`editor__tool ${n==="highlight"?"editor__tool--active":""}`,onClick:()=>{r(n==="highlight"?"":"highlight")}},o.highlightToolText),t("button",{type:"button",class:`editor__tool ${n==="hide"?"editor__tool--active":""}`,onClick:()=>{r(n==="hide"?"":"hide")}},o.hideToolText)))}}function Gr({hooks:t}){function e(){const[n,r]=t.useState(G.devicePixelRatio??1);return t.useEffect(()=>{const o=()=>{r(G.devicePixelRatio)},i=matchMedia(`(resolution: ${G.devicePixelRatio}dppx)`);return i.addEventListener("change",o),()=>{i.removeEventListener("change",o)}},[]),n}return function({onBeforeScreenshot:r,onScreenshot:o,onAfterScreenshot:i,onError:c}){const l=e();t.useEffect(()=>{(async()=>{r();const s=await ve.mediaDevices.getDisplayMedia({video:{width:G.innerWidth*l,height:G.innerHeight*l},audio:!1,monitorTypeSurfaces:"exclude",preferCurrentTab:!0,selfBrowserSurface:"include",surfaceSwitching:"exclude"}),d=w.createElement("video");await new Promise((a,f)=>{d.srcObject=s,d.onloadedmetadata=()=>{o(d,l),s.getTracks().forEach(_=>_.stop()),a()},d.play().catch(f)}),i()})().catch(c)},[])}}function jr(t,e,n){switch(t.type){case"highlight":{e.shadowColor="rgba(0, 0, 0, 0.7)",e.shadowBlur=50,e.fillStyle=n,e.fillRect(t.x-1,t.y-1,t.w+2,t.h+2),e.clearRect(t.x,t.y,t.w,t.h);break}case"hide":e.fillStyle="rgb(0, 0, 0)",e.fillRect(t.x,t.y,t.w,t.h);break}}function Q(t,e,n){if(!t)return;const r=t.getContext("2d",e);r&&n(t,r)}function Ge(t,e){Q(t,{alpha:!0},(n,r)=>{r.drawImage(e,0,0,e.width,e.height,0,0,n.width,n.height)})}function je(t,e,n){Q(t,{alpha:!0},(r,o)=>{n.length&&(o.fillStyle="rgba(0, 0, 0, 0.25)",o.fillRect(0,0,r.width,r.height)),n.forEach(i=>{jr(i,o,e)})})}function Yr({h:t,hooks:e,outputBuffer:n,dialog:r,options:o}){const i=Gr({hooks:e}),c=zr({h:t}),l=qr({h:t}),u={__html:Vr(o.styleNonce).innerText},s=r.el.style,d=({screenshot:a})=>{const[f,_]=e.useState("highlight"),[g,y]=e.useState([]),v=e.useRef(null),h=e.useRef(null),b=e.useRef(null),A=e.useRef(null),[x,V]=e.useState(1),U=e.useMemo(()=>{const m=w.getElementById(o.id);if(!m)return"white";const S=getComputedStyle(m);return S.getPropertyValue("--button-primary-background")||S.getPropertyValue("--accent-background")},[o.id]);e.useLayoutEffect(()=>{const m=()=>{const S=v.current;S&&(Q(a.canvas,{alpha:!1},R=>{const M=Math.min(S.clientWidth/R.width,S.clientHeight/R.height);V(M)}),(S.clientHeight===0||S.clientWidth===0)&&setTimeout(m,0))};return m(),G.addEventListener("resize",m),()=>{G.removeEventListener("resize",m)}},[a]);const F=e.useCallback((m,S)=>{Q(m,{alpha:!0},(R,M)=>{M.scale(S,S),R.width=a.canvas.width,R.height=a.canvas.height})},[a]);e.useEffect(()=>{F(h.current,a.dpi),Ge(h.current,a.canvas)},[a]),e.useEffect(()=>{F(b.current,a.dpi),Q(b.current,{alpha:!0},(m,S)=>{S.clearRect(0,0,m.width,m.height)}),je(b.current,U,g)},[g,U]),e.useEffect(()=>{F(n,a.dpi),Ge(n,a.canvas),Q(w.createElement("canvas"),{alpha:!0},(m,S)=>{S.scale(a.dpi,a.dpi),m.width=a.canvas.width,m.height=a.canvas.height,je(m,U,g),Ge(n,m)})},[g,a,U]);const O=m=>{if(!f||!A.current)return;const S=A.current.getBoundingClientRect(),R={type:f,x:m.offsetX/x,y:m.offsetY/x},M=(N,H)=>{const D=(H.clientX-S.x)/x,W=(H.clientY-S.y)/x;return{type:N.type,x:Math.min(N.x,D),y:Math.min(N.y,W),w:Math.abs(D-N.x),h:Math.abs(W-N.y)}},ne=N=>{Q(b.current,{alpha:!0},(H,D)=>{D.clearRect(0,0,H.width,H.height)}),je(b.current,U,[...g,M(R,N)])},le=N=>{const H=M(R,N);H.w*x>=1&&H.h*x>=1&&y(D=>[...D,H]),w.removeEventListener("mousemove",ne),w.removeEventListener("mouseup",le)};w.addEventListener("mousemove",ne),w.addEventListener("mouseup",le)},T=e.useCallback(m=>S=>{S.preventDefault(),S.stopPropagation(),y(R=>{const M=[...R];return M.splice(m,1),M})},[]),$={width:`${a.canvas.width*x}px`,height:`${a.canvas.height*x}px`},X=m=>{m.stopPropagation()};return t("div",{class:"editor"},t("style",{nonce:o.styleNonce,dangerouslySetInnerHTML:u}),t("div",{class:"editor__image-container"},t("div",{class:"editor__canvas-container",ref:v},t("canvas",{ref:h,id:"background",style:$}),t("canvas",{ref:b,id:"foreground",style:$}),t("div",{ref:A,onMouseDown:O,style:$},g.map((m,S)=>t("div",{key:S,class:"editor__rect",style:{top:`${m.y*x}px`,left:`${m.x*x}px`,width:`${m.w*x}px`,height:`${m.h*x}px`}},t("button",{"aria-label":o.removeHighlightText,onClick:T(S),onMouseDown:X,onMouseUp:X,type:"button"},t(l,null))))))),t(c,{options:o,action:f,setAction:_}))};return function({onError:f}){const[_,g]=e.useState();return i({onBeforeScreenshot:e.useCallback(()=>{s.display="none"},[]),onScreenshot:e.useCallback((y,v)=>{Q(w.createElement("canvas"),{alpha:!1},(h,b)=>{b.scale(v,v),h.width=y.videoWidth,h.height=y.videoHeight,b.drawImage(y,0,0,h.width,h.height),g({canvas:h,dpi:v})}),n.width=y.videoWidth,n.height=y.videoHeight},[]),onAfterScreenshot:e.useCallback(()=>{s.display="block"},[]),onError:e.useCallback(y=>{s.display="block",f(y)},[])}),_?t(d,{screenshot:_}):t("div",null)}}const Jr=(()=>({name:"FeedbackScreenshot",setupOnce(){},createInput:({h:t,hooks:e,dialog:n,options:r})=>{const o=w.createElement("canvas");return{input:Yr({h:t,hooks:e,outputBuffer:o,dialog:n,options:r}),value:async()=>{const i=await new Promise(c=>{o.toBlob(c,"image/png")});if(i)return{data:new Uint8Array(await i.arrayBuffer()),filename:"screenshot.png",contentType:"application/png"}}}}}));export{Kr as a,Zr as b,Jr as f,Xr as g,or as s};
