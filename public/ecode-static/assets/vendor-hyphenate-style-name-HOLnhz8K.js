var a=/[A-Z]/g,n=/^ms-/,t={};function o(e){return"-"+e.toLowerCase()}function h(e){if(t.hasOwnProperty(e))return t[e];var r=e.replace(a,o);return t[e]=n.test(r)?"-"+r:r}export{h};
