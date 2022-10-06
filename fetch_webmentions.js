
const fs = require('fs')
const https = require('https')

const {
	BASE_URL, // baseURL to resolve relative URLs for MF parser // Rename this
	SHORT_URL,
	WEBMENTION_IO_TOKEN
} = process.env
const WM_DIR = process.env.WEBMENTIONS_DIR || './wm'
const CACHE_FILENAME = process.env.CACHE_FILENAME || `${WM_DIR}/cache`

if (!BASE_URL || !SHORT_URL) {
	throw new Error('Missing URL and/or SHORT_URL in .env')
}

const Request = {
	send(url, method) {
		return new Promise((resolve, reject) => {
			const req = https.request(url, { method: method }, res => {
				res.setEncoding('utf8')
				let responseBody = ''
				res.on('data', (chunk) => { responseBody += chunk })
				res.on('end', () => { resolve(JSON.parse(responseBody)) })
			})
			req.on('error', err => { reject(err) })
			req.end()
		})
	},
	get(url) {
		return Request.send(url, 'GET')
	}
}

const fetchWebmentions = async () => {
	const webmentions = await Request.get(`https://webmention.io/api/mentions.jf2?token=${WEBMENTION_IO_TOKEN}&per-page=100`)
	if (webmentions.children) {
		return webmentions.children
	}
}

const Cache = {
	read() {
		if (fs.existsSync(CACHE_FILENAME)) {
			return fs.readFileSync(CACHE_FILENAME, 'utf-8')
		}
	},
	write(data) {
		fs.writeFileSync(CACHE_FILENAME, data, null, 2)
	}
}

// Sometimes my targets show up as www.domain.tld, domain.tld, www.short.tld, short.tld.
// This removes all valid urls
const cleanTarget = (target, urlString) => {
	const url = new URL(urlString)
	const regex = new RegExp(`https?:\/\/(www.)?${url.hostname.replace('www.', '')}`)
	return target.replace(regex, '')
}

const targetToSlug = target => {
	let slug = target
	if (BASE_URL) {
		slug = cleanTarget(slug, BASE_URL)
	}
	if (SHORT_URL) {
		slug = cleanTarget(slug, SHORT_URL)
	}
	if (slug == target) {
		return console.error(`${slug} does not seem to be a valid target`)
	}
	return slug
		.replace(/^\/*|\/*$/g, '') // Remove leading or trailing slashes
		.replace('/', '--')
}

const start = async () => {
	const webmentions = await fetchWebmentions()
	if (!webmentions || webmentions.length === 0) {
		return console.log('Could not find any webmentions. Exiting')
	}

	if (!fs.existsSync(WM_DIR)) fs.mkdirSync(WM_DIR)

	const latest = Cache.read()
	let newest, done = false
	webmentions.forEach(wm => {
		if (!newest) {
			newest = wm['wm-id']
		}
		if (latest && latest == wm['wm-id']) {
			done = true
			console.log(`Found last processed webmention [${latest}]. Skipping the rest.`)
		}
		if (done) return

		// Process webmention
		const slug = targetToSlug(wm['wm-target'])
		if (slug !== null) {
			const filename = `${WM_DIR}/${slug || 'home'}.json`
			let entries
			if (fs.existsSync(filename)) {
				entries = JSON.parse(fs.readFileSync(filename))
					.filter(m => m['wm-id'] !== wm['wm-id'])
					.concat([wm])
				entries.sort((a, b) => a['wm-id'] - b['wm-id'])
			} else {
				entries = [wm]
			}

			fs.writeFileSync(filename, JSON.stringify(entries, null, 2))
		}
	})

	Cache.write(newest.toString())
}

start()
