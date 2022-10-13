
const pluginRss = require('@11ty/eleventy-plugin-rss')
const markdownIt = require('markdown-it')
const shortlinks = require('eleventy-plugin-shortlinks')
// for webmentions
const fs = require('fs')
const path = require('path')

require('dotenv').config()

module.exports = function (eleventyConfig) {
	const { DateTime } = eleventyConfig // import luxon from eleventy

	eleventyConfig.addPlugin(pluginRss)
	eleventyConfig.addPlugin(shortlinks)

	eleventyConfig.setDataDeepMerge(true)
	eleventyConfig.addGlobalData('today', () => new Date())

	const md = markdownIt({ html: true, linkify: true })
	const imgRenderer = md.renderer.rules.image
	md.renderer.rules.image = (tokens, idx, options, env, self) =>
		`<span class="img-block">${imgRenderer(tokens, idx, options, env, self)}</span>`
	eleventyConfig.setLibrary('md', md)

	eleventyConfig.addPassthroughCopy({ 'static': '/' })
	eleventyConfig.addPassthroughCopy('uploads')

	eleventyConfig.addNunjucksFilter('getVariable', function (string) {
		// Need this to access global variables with dashes. (`like-of`)
		// https://github.com/11ty/eleventy/issues/567#issuecomment-575828788
		// https://www.11ty.dev/docs/languages/javascript/#warning-about-arrow-functions
		return this.getVariables()[string]
	})

	// nunjucks slice doesnt work like js slice
	// `limit` filter returns the first `n` elements of array
	eleventyConfig.addFilter('limit', (arr, n) => arr.slice(0, n))

	// Filter to treat frontmatter item that could be an array as such
	// https://github.com/11ty/eleventy/issues/1611
	eleventyConfig.addFilter('toArray', value => Array.isArray(value) ? value : [value])

	// Removes script tags in rss content string
	eleventyConfig.addFilter('stripScript', text => text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ''))

	const getTZ = date => {
		// https://www.11ty.dev/docs/dates/#dates-off-by-one-day
		// If `date` is provided in YYYY-MM-DD, assume the date is in UTC so `dateString` can work correctly
		if (date instanceof Date && date.toISOString().indexOf('T00:00:00.000Z') > 0) {
			return { zone: 'utc' }
		}
	}
	// `updated` is not converted to Date so this catches those cases and converts it
	const fromJSDate = date => DateTime.fromJSDate(date instanceof Date ? date : new Date(date), getTZ(date))
	eleventyConfig.addFilter('dateISO', dateObj => fromJSDate(dateObj).toISO())
	eleventyConfig.addFilter('dateString', dateObj => fromJSDate(dateObj).toFormat('LLL dd, yyyy'))

	eleventyConfig.addFilter('toStars', (n = 0, max = 5) =>
		'★'.repeat(Math.min(parseInt(n), max)) + (n - parseInt(n) > 0 ? '½' : ''))

	eleventyConfig.addFilter('alphabetSort', collection => {
		const alphabet = [ '#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R',  'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '?' ]

		const sorted = alphabet.reduce((res, letter) => {
			res.set(letter, [])
			return res
		}, new Map())

		for (let tag in collection) {
			let key = (tag[0] || '?').toUpperCase()
			key = isNaN(key) ? key : '#'
			sorted.get(key).push(tag)
		}
		return sorted
	})

	eleventyConfig.addCollection('tagList', collection => {
		let tags = {}
		collection.getAll().forEach(item => {
			(item.data.tags || []).forEach(tag => {
				tag = tag.toLowerCase()
				tags[tag] = tags[tag] || []
				tags[tag].push(item)
			})
		})
		return tags
	})

	const allowedContent = ['articles', 'bookmarks', 'likes', 'notes', 'rsvp', 'watched']
	allowedContent.forEach(type => {
		eleventyConfig.addCollection(type, collection =>
			collection.getFilteredByGlob(`src/content/${type}/*.md`))
	})

	eleventyConfig.addCollection('replies', collection =>
		collection.getFilteredByGlob('src/content/notes/*.md').filter(item => 'in-reply-to' in item.data))

	eleventyConfig.addCollection('feed', collection =>
		collection.getFilteredByGlob(['src/content/articles/*.md', 'src/content/notes/*.md']))

	eleventyConfig.addShortcode('prefix', url => {
		if (url) {
			if (url.match(/^\/articles\//g)) {
				return 'b' // blog post, article (structured, with headings), essay
			}
			if (url.match(/^\/(bookmarks|likes)\//g)) {
				return 'f' // favorited - primarily just a URL, often to someone else's content
			}
			if (url.match(/^\/(notes|rsvp|watched)\//g)) {
				return 't' // text, (plain) text, tweet, thought, note, unstructured, untitled
			}
		}
		return ''
	})

	// webmentions
	eleventyConfig.addGlobalData('webmentions', () => {
		const filePath = process.env.WEBMENTIONS_DIR || './wm'
		const webmentions = {}

		fs.readdir(filePath, (err, files) => {
			if (err) return console.error('ERROR:', err.code || 'unexpected error')

			files.forEach(async file => {
				if (path.extname(file) === '.json') {
					webmentions[path.basename(file, '.json')] = JSON.parse(fs.readFileSync(`${filePath}/${file}`))
				}
			})
		})

		return webmentions
	})

	// Uses same slug function that is used in `fetch_webmentions.js`
	eleventyConfig.addFilter('webmentionSlug', url => !url ? null : url.replace(/^\/*|\/*$/g, '').replace('/', '--'))

	return {
		passthroughFileCopy: true,
		markdownTemplateEngine: 'njk',
		templateFormats: ['html', 'njk', 'md'],
		dir: {
			input: 'src',
			data: '_data',
			output: '_site',
			includes: '_includes'
		}
	}
}
