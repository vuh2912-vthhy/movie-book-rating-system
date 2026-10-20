'use strict';
window.addEventListener('load', function () {
    window.ui = window.SwaggerUIBundle({
        url: '/openapi.yaml',
        dom_id: '#swagger',
        docExpansion: 'list',
        defaultModelsExpandDepth: 0,
        tryItOutEnabled: true,
        requestInterceptor: function (req) { req.credentials = 'same-origin'; return req; }
    });
});
