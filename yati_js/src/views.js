(function (yati, Backbone, barebone, _, ko, kb) {

    ko.bindingHandlers.block = {
        update: function(element, value_accessor) {
            return element.style.display = ko.utils.unwrapObservable(value_accessor()) ? 'block' : 'none';
        }
    };
    ko.bindingHandlers.inline = {
        update: function(element, value_accessor) {
            return element.style.display = ko.utils.unwrapObservable(value_accessor()) ? 'inline' : 'none';
        }
    };

    var initUnitSet = function (model) {
        this.progress = ko.computed(function () { this.units_count(); return model.getProgress(); }, this);
        this.count = ko.computed(function () { this.units_count(); return model.getCount(); }, this);
        this.countDone = ko.computed(function () { this.units_count(); return model.getCountDone(); }, this);
    };
    var collectionFactory = function (view_model) { return function (col) { return kb.collectionObservable(col, {view_model: view_model})} };

    yati.views = {};

    yati.views.AppView = kb.ViewModel.extend({
        constructor: function (model) {
            model = yati.app;
            kb.ViewModel.prototype.constructor.call(this, model, {
                keys: ['language', 'languageDisplay', 'languages', 'view', 'project', 'module', 'terms', 'user'],
                factories: {
                    project: yati.views.ProjectView,
                    projects: collectionFactory(yati.views.ProjectView),
                    module: yati.views.ModuleView,
                    terms: collectionFactory(yati.views.TermView),
                    user: yati.views.UserView
                }
            });

            yati.appView = this;

            Backbone.history.start({pushState: true});
            $(document).foundation();
        }
    });

    yati.views.LanguageView = kb.ViewModel.extend({
        constructor: function (model) {
            kb.ViewModel.prototype.constructor.call(this, model,
                ['id', 'units_count']);
            this.model = model;

            this.country = ko.computed(function () {
                var lang = yati.app.get('languages').get(this.id());
                if (lang) return lang.get('country');
                return this.id();
            }, this);

            this.display = ko.computed(function () {
                var lang = yati.app.get('languages').get(this.id());
                if (lang) return lang.get('display');
                return this.id();
            }, this);

            initUnitSet.call(this, model);
        }
    });

    yati.views.ProjectView = kb.ViewModel.extend({
        constructor: function (model) {
            kb.ViewModel.prototype.constructor.call(this, model, {
                keys: ['id', 'name', 'modules', 'units_count', 'targetlanguages', 'users', 'invite_user'],
                factories: {
                    modules: collectionFactory(yati.views.ModuleView),
                    targetlanguages: collectionFactory(yati.views.LanguageView),
                    users: collectionFactory(yati.views.UserView),
                    invite_user: yati.views.UserFormView
                }
            });

            this.canChange = ko.computed(function () {
                return (this.model().get('project_permissions')||[]).indexOf('change_project') > -1;
            }, this);

            /*this.targetlanguages = ko.computed(function () {
                // @TODO subset languages colletion??
                // @TODO this observable needs dependencies (when langauges will be added)
                // @TODO unsafe if language not found in languages collection
                return _(this.model().getLanguagesForUser(yati.app.get('user')))
                    .map(function (l) {
                        var lang = yati.app.get('languages').get(l.get('id'));
                        return {id: l.get('id'), display: lang ? lang.get('display') : l.get('id'), country: lang.get('country'), units_count: l.get('units_count')};
                    });

            }, this);*/

            initUnitSet.call(this, model);
        }
    });

    yati.views.ModuleView = kb.ViewModel.extend({
        constructor: function (model) {
            kb.ViewModel.prototype.constructor.call(this, model, {
                keys: ['id', 'name', 'units', 'units_count'],
                factories: {
                    units: collectionFactory(yati.views.UnitView)
                }
            });

            this.link = ko.computed(function () {
                return '#' + yati.app.get('language') + '/' + yati.app.get('project').get('id') + '/' + this.id() + '/';
            }, this);

            // @TODO this is the only thing that even remotely works <-- ???
            // better pattern for related models that are not in attributes?
            // (or that are in attributes but not as relations)
            this.unitsParams = ko.computed(function () {
                return new yati.views.UnitsQueryParamsView(this.model().get('units').queryParams);
            }, this);

            var val = null;
            var setQvalue = _(function () {
                this.unitsParams().q(val);
            }).chain().bind(this).debounce(300).value();

            this.searchQuery = ko.computed({
                read: function(){
                    return this.unitsParams().q();
                },
                write: function(value) {
                    val = value;
                    if ((value||'').length >= 3) {
                        setQvalue();
                    } else {
                        val = null;
                        this.unitsParams().q(val);
                    }
                }
            }, this);

            this.onClear = _(function () {
                val = null;
                this.unitsParams().q(null);
            }).bind(this);

            initUnitSet.call(this, model);
        }
    });

    yati.views.UnitView = kb.ViewModel.extend({
        constructor: function (model) {
            kb.ViewModel.prototype.constructor.call(this, model, {
                keys: ['id', 'msgid', 'msgstr'],
                factories: {
                    //msgid: collectionFactory(yati.views.StringView), too heavy + deprecated (do this for msgid_plural and msgstr_plural)
                    //msgstr: collectionFactory(yati.views.StringView)
                }
            });

            this.plural = ko.computed(function () { return model.isPlural(); });

            this.edit = ko.observable(false);
            this.edit.subscribe(function (val) {
                // @TODO out-of-paradigm fuglyness
                _(function () {
                    $('textarea[data-id=unit-'+this.id()+']')[val ? 'autosize' : 'trigger'](val ? undefined : 'autosize.destroy');
                }).chain().bind(this).defer();
                yati.app.set_term_unit(val ? model : null);
            }, this);

            this.onclick = _(function () {
                this.edit(true);
            }).bind(this);
        }
    });

    yati.views.QueryParamsView = kb.ViewModel.extend({
        constructor: function (model, options) {
            options || (options = {});
            options.keys || (options.keys = []);
            options.keys = options.keys.concat(['page','count','pageSize']);
            kb.ViewModel.prototype.constructor.call(this, model, options);

            this.pageCount = ko.computed(function () {
                this.page(); this.count(); this.pageSize();
                if (!this.page()||!this.count()) return 0;
                return model.getPages();
            }, this);

            // returns pagination pages (current page and 3+3 neighbours)
            this.pages = ko.computed(function () {
                if (!this.page()||!this.count()) return [];
                var page = model.get('page'); // @TODO model schemas
                return _(page > 3 ? page-3 : 1).chain().range(
                        page < this.pageCount() - 3 ? page+4 : this.pageCount()+1
                    ).map(function (i) { return { page: i, link: this.pageLink(i) }; }, this)
                    .value();
            }, this);
        },
        pageLink: function (page) {
            return '#';
        }
    });

    yati.views.UnitsQueryParamsView = yati.views.QueryParamsView.extend({
        constructor: function (model) {
            yati.views.QueryParamsView.prototype.constructor.call(this, model, {keys: ['filter', 'q']});
        },
        pageLink: function (page) {
            return yati.router.link('module', null, null, null, this.filter() || 'all', page);
        }
    });

    yati.views.TermView = kb.ViewModel.extend({
        constructor: function (model) {
            kb.ViewModel.prototype.constructor.call(this, model, {
                keys: ['msgid', 'msgstr']
            });
        }
    });

    yati.views.UserView = kb.ViewModel.extend({
        constructor: function (model) {
            kb.ViewModel.prototype.constructor.call(this, model, {
                keys: ['id', 'email', 'is_active', 'last_login', 'invite_token'],
                factories: {
                    languages: collectionFactory(yati.views.LanguageView)
                }
            });
        }
    });

    yati.views.UserFormView = kb.ViewModel.extend({
        constructor: function (model) {
            kb.ViewModel.prototype.constructor.call(this, model, {
                keys: ['email', 'language']
            });
            _(this).bindAll('onSubmit');

            this.submitting = ko.observable(false);
            this.formError = ko.observable(null);
            this.emailError = ko.observable(null);
        },
        onSubmit: function () {
            var projectId = yati.app.get('project').get('id'),
                that = this;
            this.submitting(true);

            this.model().invite(projectId).done(function (data) {
                yati.app.get('project').get('users').add(data);
                yati.router.navigate(yati.router.link('project_users', projectId), {trigger: true});
            }).error(function (xhr) {
                that.submitting(false);
                var data = {},
                    emailError;
                try {
                    data = JSON.parse(xhr.responseText);
                    if (data.email && data.email[0]) {
                        emailError = data.email[0];
                    }
                } catch (e) {}
                emailError ? that.emailError(emailError) : that.formError('Something went wrong');
            });
        }
    });

}(yati, Backbone, barebone, _, ko, kb));