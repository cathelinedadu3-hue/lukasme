"""Bound request bytes before parsing and protect every response, including rejections."""
from starlette.responses import JSONResponse


class SecurityMiddleware:
    def __init__(self, app, max_bytes=2_000_000):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)

        async def secure_send(message):
            if message['type'] == 'http.response.start':
                headers = [(k, v) for k, v in message.get('headers', []) if k.lower() not in
                           (b'cache-control', b'x-content-type-options', b'x-frame-options')]
                headers.extend([(b'cache-control', b'no-store'),
                                (b'x-content-type-options', b'nosniff'),
                                (b'x-frame-options', b'DENY')])
                message = {**message, 'headers': headers}
            await send(message)

        async def reject():
            await JSONResponse({'detail': 'Request body is too large or has an invalid length.'},
                               status_code=413)(scope, receive, secure_send)

        lengths = [v for k, v in scope['headers'] if k.lower() == b'content-length']
        if len(lengths) > 1 or any(not v.isdigit() or len(v) > 10 or int(v) > self.max_bytes for v in lengths):
            return await reject()
        chunks = []
        size = 0
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            chunk = message.get('body', b'')
            size += len(chunk)
            if size > self.max_bytes:
                return await reject()
            chunks.append(chunk)
            if not message.get('more_body', False):
                break
        body = b''.join(chunks)
        consumed = False

        async def bounded_receive():
            nonlocal consumed
            if consumed:
                return await receive()
            consumed = True
            return {'type': 'http.request', 'body': body, 'more_body': False}

        await self.app(scope, bounded_receive, secure_send)
