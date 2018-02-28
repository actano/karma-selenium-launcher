import {
  parse as urlparse,
  format as urlformat,
} from 'url'
import { Builder } from 'selenium-webdriver'

// Handle x-ua-compatible option same as karma-ie-launcher(copy&paste):
//
// Usage :
//   customLaunchers: {
//     IE9: {
//       base: 'WebDriver',
//       config: webdriverConfig,
//       'x-ua-compatible': 'IE=EmulateIE9'
//     }
//   }
//
// This is done by passing the option on the url, in response the Karma server will
// set the following meta in the page.
//   <meta http-equiv="X-UA-Compatible" content="[VALUE]"/>
const XUA = 'x-ua-compatible'

function handleXUaCompatible(spec, urlObj) {
  if (spec[XUA]) {
    const q = urlObj.query || {}
    const query = { ...q, [XUA]: spec[XUA] }
    return { ...urlObj, query }
  }
  return urlObj
}

const buildSeleniumUrl = ({ hostname, port }) => `http://${hostname}:${port}/wd/hub`

const factory = (baseBrowserDecorator, logger, args) => {
  const log = logger.create('Selenium-Launcher')
  const { config, pseudoActivityInterval } = args
  const spec = {
    platform: 'ANY',
    testName: 'Karma test',
    tags: [],
    version: '',
    ...args,
  }

  delete spec.config
  delete spec.pseudoActivityInterval

  if (!spec.browserName) {
    throw new Error('browserName is required!')
  }

  const browser = {}
  baseBrowserDecorator(browser)
  browser.name = `${spec.browserName} via Selenium`

  let kill

  const start = async (url) => {
    let driver
    let interval

    const stop = async () => {
      if (interval) {
        clearInterval(interval)
      }

      if (driver && driver.getSession()) {
        log.debug('Quitting Selenium')
        await driver.quit()
      }
    }

    log.info('Connecting to %s', browser.name)

    try {
      const karmaUrl = urlformat(handleXUaCompatible(spec, urlparse(url, true)))
      const seleniumUrl = buildSeleniumUrl(config)

      driver = new Builder()
        .usingServer(seleniumUrl)
        .withCapabilities(spec)
        .build()

      interval = pseudoActivityInterval && setInterval(() => {
        log.debug('Imitate activity')
        driver.getTitle()
      }, pseudoActivityInterval)

      driver.get(karmaUrl)

      return stop
    } catch (e) {
      log.error('Error starting %s', browser.name, e)
      await stop()
      return async () => {}
    }
  }

  browser._start = (url) => {
    kill = start(url)
  }

  browser.on('kill', async (done) => {
    if (!kill) {
      done()
      return
    }

    try {
      log.debug('Killing %s', browser.name)
      const stop = await kill
      await stop()
      done()
      log.info('Killed %s', browser.name)
    } catch (e) {
      done(e)
    }
  })

  return browser
}

factory.$inject = ['baseBrowserDecorator', 'logger', 'args']

export default {
  'launcher:Selenium': ['factory', factory],
}
