// Code de mesure placé dans <head>, AVANT gtag/GTM (identique dans DC--landing-pages et VD--landing-pages).
//
// 1. Consentement (Loi 25) — seulement si measure.consentBanner est vrai :
//    Google Consent Mode v2, tout « refusé » par défaut, puis choix mémorisé (témoin dc_consent) appliqué
//    avant le chargement de GTM.
// 2. Microsoft Clarity — seulement si measure.clarity contient l'identifiant du projet :
//    - consentement Clarity v2 (sans accord : mode sans témoin, un identifiant par page vue) ;
//    - étiquettes de test (ab_test, ab_variant) et d'attribution non personnelle (utm_*, type de clic).
//
// Sans bannière, rien ne change pour Google (même comportement que la page Unbounce) et Clarity
// fonctionne sans témoin.

export const CONSENT_COOKIE = 'dc_consent';

export function measureHead({ measure = {}, test, variant, pagePath }) {
  const cfg = {
    banner: !!measure.consentBanner,
    clarity: /^[a-z0-9]{6,16}$/i.test(measure.clarity || '') ? measure.clarity : '',
    test, variant, path: pagePath
  };
  if (!cfg.banner && !cfg.clarity) return '';
  const consent = cfg.banner ? `
g('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'granted',security_storage:'granted',wait_for_update:500});
g('set','ads_data_redaction',true);g('set','url_passthrough',true);
if(m)g('consent','update',{analytics_storage:a?'granted':'denied',ad_storage:k?'granted':'denied',ad_user_data:k?'granted':'denied',ad_personalization:k?'granted':'denied'});` : '';
  const clarity = cfg.clarity ? `
(function(c2,l,a2,r,i,t,y){c2[a2]=c2[a2]||function(){(c2[a2].q=c2[a2].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(w,d,"clarity","script",c.clarity);
w.clarity('consentv2',{ad_Storage:k?'granted':'denied',analytics_Storage:a?'granted':'denied'});
w.clarity('set','ab_test',c.test);w.clarity('set','ab_variant',c.variant);w.clarity('set','lp_path',c.path);
var q=new URLSearchParams(w.location.search),ok=function(v){return v&&v.length<=100&&!/[<>{}@]|\\d{3}[\\s.-]?\\d{3}[\\s.-]?\\d{4}/.test(v)};
['utm_source','utm_medium','utm_campaign'].forEach(function(n){var v=q.get(n);if(ok(v))w.clarity('set',n,v);});
var ck=['gclid','gbraid','wbraid','fbclid','msclkid'].filter(function(n){return q.get(n);})[0];if(ck)w.clarity('set','click_id_type',ck);
if(q.get('dc_qa')==='1'||q.has('dc_variant'))w.clarity('set','qa','1');` : '';
  return `<script>
(function(w,d,c){
var dl=w.dataLayer=w.dataLayer||[];function g(){dl.push(arguments);}
var m=d.cookie.match(/(?:^|; )${CONSENT_COOKIE}=v1\\.a([01])\\.m([01])/);
var a=c.banner&&!!m&&m[1]==='1', k=c.banner&&!!m&&m[2]==='1';
w.__dcConsent={banner:c.banner,decided:!!m,analytics:a,marketing:k};${consent}${clarity}
})(window,document,${JSON.stringify(cfg)});
</script>`;
}
