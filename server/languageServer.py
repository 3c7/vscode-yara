''' Implements a VSCode language server for YARA '''
import asyncio
import json
import logging
import logging.handlers

try:
    import yara
    HAS_YARA = True
except ModuleNotFoundError:
    # set INCLUDE="C:\Program Files (x86)\Windows Kits\10\Include" && python -m pip install yara-python
    logging.warning("yara-python not installed. Diagnostics will not be available")
    HAS_YARA = False

LOGGER = logging.getLogger(__name__).addHandler(logging.NullHandler())


def _build_logger() -> logging.Logger:
    ''' Build the loggers '''
    global LOGGER
    LOGGER = logging.getLogger(__name__)
    screen_hdlr = logging.StreamHandler()
    screen_hdlr.setFormatter(logging.Formatter("%(message)s"))
    screen_hdlr.setLevel(logging.INFO)
    file_hdlr = logging.handlers.RotatingFileHandler(filename=".yara.log", backupCount=1, maxBytes=100000)
    file_hdlr.setFormatter(logging.Formatter("%(asctime)s | [%(levelname)s:%(module)s:%(lineno)d] %(message)s"))
    file_hdlr.setLevel(logging.DEBUG)
    LOGGER.addHandler(screen_hdlr)
    LOGGER.addHandler(file_hdlr)
    LOGGER.setLevel(logging.DEBUG)

@asyncio.coroutine
async def code_completion_provider(request: dict) -> str:
    ''' Respond to the completionItem/resolve request '''
    LOGGER.warning("code_completion_provider() is not yet implemented")

@asyncio.coroutine
async def definition_provider(request: dict) -> str:
    ''' Respond to the textDocument/definition request '''
    LOGGER.warning("definition_provider() is not yet implemented")
    return {
        "jsonrpc": "2.0",
        "id": request["id"],
        "result": {}
    }

@asyncio.coroutine
async def diagnostic_provider(request: dict) -> str:
    ''' Respond to the textDocument/publishDiagnostics request
    The message carries an array of diagnostic items for a resource URI.
    '''
    if HAS_YARA:
        LOGGER.warning("diagnostic_provider() is not yet implemented")
        logging.debug("yara-python is installed")
        response = {
            "jsonrpc": "2.0",
            "id": request["id"],
            "result": {}
        }
    elif not HAS_YARA:
        LOGGER.error("yara-python is not installed. Diagnostics are disabled")
        response = {}
    return response

@asyncio.coroutine
async def highlight_provider(request: dict) -> str:
    ''' Respond to the textDocument/documentHighlight request '''
    LOGGER.warning("highlight_provider() is not implemented")
    return {
        "jsonrpc": "2.0",
        "id": request["id"],
        "result": {}
    }

@asyncio.coroutine
async def reference_provider(request: dict) -> str:
    ''' Respond to the textDocument/references request '''
    LOGGER.warning("reference_provider() is not yet implemented")
    return {
        "jsonrpc": "2.0",
        "id": request["id"],
        "result": {}
    }

@asyncio.coroutine
async def rename_provider(request: dict) -> str:
    ''' Respond to the textDocument/rename request '''
    LOGGER.warning("rename_provider() is not yet implemented")
    return {
        "jsonrpc": "2.0",
        "id": request["id"],
        "result": {}
    }

@asyncio.coroutine
async def initialize() -> str:
    ''' Announce language support methods '''
    # document_selector = { "language": "yara", "scheme": "file" }
    LOGGER.debug("inside initialize()")
    return json.dumps({
        "capabilities": {
            # "codeActionProvider": False,
            # "codeLensProvider": False,
            # "colorProvider": False,
            "completionProvider" : {
                "triggerCharacters": [ "." ]
            },
            "definitionProvider": True,
            # "documentFormattingProvider": False,
            "documentHighlightProvider": True,
            # "documentOnTypeFormattingProvider": False,
            # "documentRangeFormattingProvider": False,
            # "documentSymbolProvider": False,
            # "hoverProvider": False,
            "referencesProvider": True,
            "renameProvider": True,
            # "signatureHelpProvider": False,
            # "workspaceSymbolProvider": False,
        }
    }).encode()

@asyncio.coroutine
async def protocol_handler(reader:asyncio.StreamReader, writer: asyncio.StreamWriter) -> str:
    ''' Set up the server '''
    announcement = await initialize()
    writer.write(announcement)
    await writer.drain()
    data = await reader.readline()
    key, value = tuple(data.decode().strip().split(" "))
    header = {key: value}
    LOGGER.debug("%s: %s", key, header[key])
    data = await reader.read(int(value)+1)
    body = data.decode()
    print(body)
    LOGGER.info("Closing connection")
    writer.close()


async def main():
    ''' Program entrypoint '''
    LOGGER.info("Starting YARA IO language server")
    eventloop = asyncio.get_event_loop()
    eventloop.set_debug(enabled=True)
    server = await asyncio.start_server(
        client_connected_cb=protocol_handler,
        host="127.0.0.1",
        port=8471,
        loop=eventloop)
    LOGGER.info("Serving on {}".format(server.sockets[0].getsockname()))
    async with server:
        task = await server.serve_forever()
        print(task)
        server.close()


if __name__ == "__main__":
    try:
        _build_logger()
        asyncio.run(main())
    except KeyboardInterrupt:
        LOGGER.critical("Stopping at user's request")
    except Exception as err:
        LOGGER.exception(err)
