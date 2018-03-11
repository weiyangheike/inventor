/**
 * 路由处理器
 *
 * @author : sunkeysun
 */

import path from 'path'
import CoreRouter from 'koa-router'

import IClass from '../support/base/IClass'
import Route from './Route'
import Request from '../http/Request'
import Response from '../http/Response'
import { normalizeMiddleware } from '../support/helpers'

export default class Router extends IClass {
    _routePath = ''
    _options={
        middlewares: [],
        locals: {},
    }
    _coreRouter = new CoreRouter()

    get routePath() {
        return this._routePath
    }

    set routePath(routePath) {
        this._routePath = routePath
    }

    set options(options) {
        this._options = options
    }

    get(...args) {
        args.unshift('get')
        return this._handle(...args)
    }

    post(...args) {
        args.unshift('post')
        return this._handle(...args)
    }

    put(...args) {
        args.unshift('put')
        return this._handle(...args)
    }

    delete(...args) {
        args.unshift('delete')
        return this._handle(...args)
    }

    patch(...args) {
        args.unshift('patch')
        return this._handle(...args)
    }

    resource(resource, controller) {
        this.post(`${resource}`, `${controller}@add`)
        this.delete(`${resource}/:id`, `${controller}@remove`)
        this.put(`${resource}/:id`, `${controller}@update`)
        this.get(`${resource}`, `${controller}@list`)
        this.get(`${resource}/:id`, `${controller}@query`)
    }

    group(prefix, handler, { middlewares=[], locals={} }={}) {
        const prePrefix = this._routePath
        const routePath = `${prePrefix}${prefix}`
        const groupRouter = _.clone(this)

        groupRouter.routePath = routePath
        groupRouter.options = {
            middlewares: _.uniq([ ...groupRouter._options.middlewares, ...middlewares ]),
            locals: { ...groupRouter._options.locals, ...locals },
        }

        handler(groupRouter)

        return groupRouter
    }

    routes() {
        return this._coreRouter.routes()
    }

    _getMiddlewareHandlers(middleware=[]) {
        const middlewareHandlers = _.map(middleware, (Middleware) => {
            return normalizeMiddleware(Middleware.handle.bind(Middleware))
        })

        return middlewareHandlers
    }

    _handle(method, routePath, handler, { middlewares=[], locals=[] }={}) {
        const prefix = _.get(this, 'routePath', '')
        if (_.isArray(routePath)) {
            routePath = _.map(routePath, (routePathItem) => {
                return path.normalize(`${prefix}${routePathItem}`)
            })
        } else {
            routePath = path.normalize(`${prefix}${routePath}`)
        }

        const allLocals = { ...this._options.locals, ...locals }
        const allMiddlewares = _.uniq([ ...this._options.middlewares, ...middlewares])
        const middlewareHandlers = this._getMiddlewareHandlers(allMiddlewares)

        const route = new Route({
            handler,
            path: routePath,
            middlewares: middlewareHandlers,
            locals: allLocals,
        })

        function handleRouteError(e, ctx) {
            app().logger.error(e)

            if (ctx.iRequest.headers['x-async-request']) {
                return ctx.iResponse.json(e)
            } else {
                return ctx.iResponse.render500()
            }
        }

        const routeHandler = async (ctx, next) => {
            ctx.onerror = (e) => {
                if (e) {
                    return handleRouteError(e, ctx)
                }
            }

            try {
                await route.handle(ctx.iRequest, ctx.iResponse)
            } catch (e) {
                handleRouteError(e, ctx)
            }
        }

        const routeMiddleware = async (ctx, next) => {
            ctx.iRequest.route = route;
            await next()
        }

        const routeArgs = [ route.path, routeMiddleware, ...route.middlewares, routeHandler]

        this._coreRouter[method].apply(this._coreRouter, routeArgs)

        return this
    }
}
