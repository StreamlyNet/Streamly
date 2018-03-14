import $ from 'jquery';
import app from '../app';
import loadTemplate from '../utils/loadTemplate';
import { openSimpleMessage } from '../views/modals/SimpleMessage';
import { launchEditListingModal } from '../utils/modalManager';
import Listing from '../models/listing/Listing';
import ListingShort from '../models/listing/ListingShort';
import { events as listingEvents } from '../models/listing/';
import baseVw from './baseVw';
import ListingDetail from './modals/listingDetail/Listing';
import ReportBtn from './components/ReportBtn';
import Report from './modals/Report';
import { deleteListing } from '../utils/SearchEngineRequests';

export default class extends baseVw {
  constructor(options = {}) {
    const opts = {
      viewType: 'grid',
      reportsUrl: '',
      ...options,
    };

    super(opts);
    this.options = opts;

    if (!this.model || !(this.model instanceof ListingShort)) {
      throw new Error('Please provide a ListingShort model.');
    }
    if(opts.thumbnail){
        this.thumbnail = opts.thumbnail;
    }
    if(opts.title && opts.title.length){
        this.title = opts.title;
    }
    if(opts.price){
        this.price = {
            amount: opts.price.amount,
            currencyCode: opts.price.currencyCode
        };
    }
    if(opts.reputation){
        this.reputation = opts.reputation;
    }
    if(opts.availability){
        this.availability = opts.availability;
    }
    if(opts.isFromDiscoveryView){
        this.isFromDiscoveryView = opts.isFromDiscoveryView;
    }
    // Any provided profile model or vendor info object will also be passed into the
    // listing detail modal.
    if (opts.profile) {
      // If a profile model of the listing owner is available, please pass it in.
      this.ownerGuid = opts.profile.id;
    } else if (this.model.get('vendor')) {
      // If a vendor object is available (part of proposed search API), please pass it in.
      this.ownerGuid = this.model.get('vendor').peerID;
    } else {
      // Otherwise please provide the store owner's guid.
      this.ownerGuid = opts.ownerGuid;
    }

    if (typeof this.ownerGuid === 'undefined') {
      throw new Error('Unable to determine ownership of the listing. Please either provide' +
        ' a profile model or pass in an ownerGuid option.');
    }

    if (!opts.listingBaseUrl) {
      // When the listing card is clicked and the listing detail modal is
      // opened, the slug of the listing is concatenated with the listingBaseUrl
      // and the route is updated (both history & address bar).
      throw new Error('Please provide a listingBaseUrl.');
    }

    if (this.ownListing) {
      this.$el.addClass('ownListing');
    }

    if (this.ownListing) {
      this.listenTo(listingEvents, 'destroying', (md, destroyingOpts) => {
        if (this.isRemoved()) return;

        if (destroyingOpts.slug === this.model.get('slug')) {
          this.$el.addClass('listingDeleting');
        }

        destroyingOpts.xhr.fail(() => (this.$el.removeClass('listingDeleting')));
      });

      this.listenTo(listingEvents, 'destroy', (md, destroyOpts) => {
        if (this.isRemoved()) return;

        if (destroyOpts.slug === this.model.get('slug')) {
          this.$el.addClass('listingDeleted');
        }
      });
    }

    this.viewType = opts.viewType;
    this.reportsUrl = opts.reportsUrl;
    this.deleteConfirmOn = false;
    this.boundDocClick = this.onDocumentClick.bind(this);
    $(document).on('click', this.boundDocClick);
  }

  className() {
    return 'listingCard col clrBr clrHover clrT clrP clrSh2 contentBox';
  }

  attributes() {
    // make it possible to tab to this element
    return { tabIndex: 0 };
  }

  events() {
    return {
      'click .js-edit': 'onClickEdit',
      'click .js-delete': 'onClickDelete',
      'click .js-clone': 'onClickClone',
      'click .js-userIcon': 'onClickUserIcon',
      'click .js-deleteConfirmed': 'onClickConfirmedDelete',
      'click .js-deleteConfirmCancel': 'onClickConfirmCancel',
      'click .js-deleteConfirmedBox': 'onClickDeleteConfirmBox',
      click: 'onClick',
    };
  }

  onDocumentClick() {
    this.getCachedEl('.js-deleteConfirmedBox').addClass('hide');
    this.deleteConfirmOn = false;
  }

  onClickEdit(e) {
    app.loadingModal.open();

    this.fetchFullListing()
      .done(xhr => {
        if (xhr.statusText === 'abort' || this.isRemoved()) return;

        launchEditListingModal({
          model: this.fullListing,
        });
      })
      .always(() => {
        if (this.isRemoved()) return;
        app.loadingModal.close();
      });

    e.stopPropagation();
  }

  onClickDelete(e) {
    this.getCachedEl('.js-deleteConfirmedBox').removeClass('hide');
    this.deleteConfirmOn = true;
    e.stopPropagation();
  }

  onClickClone(e) {
    app.loadingModal.open();

    this.fetchFullListing()
      .done(xhr => {
        if (xhr.statusText === 'abort' || this.isRemoved()) return;
        launchEditListingModal({
          model: this.fullListing.cloneListing(),
        });
      })
      .always(() => {
        if (this.isRemoved()) return;
        app.loadingModal.close();
      });

    e.stopPropagation();
  }

  onClickConfirmedDelete(e) {
    e.stopPropagation();
    if (this.destroyRequest && this.destroyRequest.state === 'pending') return;
    this.destroyRequest = this.model.destroy({ wait: true });
    this.destroyRequest.done(() => {
      deleteListing(this.model.get('slug'));
    });
  }

  onClickConfirmCancel() {
    this.getCachedEl('.js-deleteConfirmedBox').addClass('hide');
    this.deleteConfirmOn = false;
  }

  onClickDeleteConfirmBox(e) {
    e.stopPropagation();
  }

  onClickUserIcon(e) {
    e.stopPropagation();
  }

  onClick(e) {
    if (this.deleteConfirmOn) return;
    if (!this.ownListing ||
        (e.target !== this.$btnEdit[0] && e.target !== this.$btnDelete[0] &&
         !$.contains(this.$btnEdit[0], e.target) && !$.contains(this.$btnDelete[0], e.target))) {
      const routeOnOpen = location.hash.slice(1);
      app.router.navigateUser(`${this.options.listingBaseUrl}${this.model.get('slug')}`,
        this.ownerGuid);

      app.loadingModal.open();

      this.fetchFullListing()
        .done(jqXhr => {
          if (jqXhr.statusText === 'abort' || this.isRemoved()) return;

          const listingDetail = new ListingDetail({
            model: this.fullListing,
            profile: this.options.profile,
            vendor: this.options.vendor,
            closeButtonClass: 'cornerTR iconBtn clrP clrBr clrSh3 toolTipNoWrap',
            modelContentClass: 'modalContent',
            openedFromStore: !!this.options.onStore,
          }).render()
            .open();

          const onListingDetailClose = () => app.router.navigate(routeOnOpen);

          this.listenTo(listingDetail, 'close', onListingDetailClose);
          this.listenTo(listingDetail, 'modal-will-remove',
            () => this.stopListening(null, null, onListingDetailClose));
        })
        .always(() => {
          if (this.isRemoved()) return;
          app.loadingModal.close();
        })
        .fail(xhr => {
          if (xhr.statusText === 'abort') return;
          app.router.listingError(xhr, this.model.get('slug'), `#${this.ownerGuid}/store`);
        });
    }
  }

  fetchFullListing(options = {}) {
    const opts = {
      showErrorOnFetchFail: true,
      ...options,
    };

    if (this.fullListingFetch && this.fullListingFetch.state() === 'pending') {
      return this.fullListingFetch;
    }

    this.fullListingFetch = this.fullListing.fetch()
      .fail(xhr => {
        if (!opts.showErrorOnFetchFail) return;
        let failReason = xhr.responseJSON && xhr.responseJSON.reason || '';

        if (xhr.status === 404) {
          failReason = app.polyglot.t('listingCard.editFetchErrorDialog.bodyNotFound');
        }

        openSimpleMessage(
          app.polyglot.t('listingCard.editFetchErrorDialog.title'),
          failReason
        );
      });

    return this.fullListingFetch;
  }

  onReportSubmitted() {
    this.reportBtn.setState({ reported: true });
  }

  startReport() {
    if (this.report) this.report.remove();

    this.report = this.createChild(Report, {
      removeOnClose: true,
      peerID: this.ownerGuid,
      slug: this.model.get('slug'),
      url: this.reportsUrl,
    })
      .render()
      .open();

    this.report.on('modal-will-remove', () => (this.report = null));
    this.listenTo(this.report, 'submitted', this.onReportSubmitted);
  }

  get ownListing() {
    return app.profile.id === this.ownerGuid;
  }

  get fullListing() {
    if (!this._fullListing) {
      this._fullListing = new Listing({
        slug: this.model.get('slug'),
      }, {
        guid: this.ownerGuid,
      });
    }

    return this._fullListing;
  }

  get viewType() {
    return this._viewType;
  }

  set viewType(type) {
    if (['list', 'grid'].indexOf(type) === -1) {
      throw new Error('The provided view type is not one of the available types.');
    }

    // This just sets the flag. It's up to you to re-render.
    this._viewType = type;
  }

  get $btnEdit() {
    return this._$btnEdit ||
      (this._$btnEdit = this.$('.js-edit'));
  }

  get $btnDelete() {
    return this._$btnDelete ||
      (this._$btnDelete = this.$('.js-delete'));
  }

  remove() {
    if (this.fullListingFetch) this.fullListingFetch.abort();
    if (this.destroyRequest) this.destroyRequest.abort();
    $(document).off(null, this.boundDocClick);
    super.remove();
  }

  render() {
    super.render();

    loadTemplate('listingCard.html', (t) => {
        var cardOptions = {
            ...this.model.toJSON(),
            ownListing: this.ownListing,
            shipsFreeToMe: this.model.shipsFreeToMe,
            viewType: this.viewType,
            displayCurrency: app.settings.get('localCurrency'),
            isFromDiscoveryView: this.isFromDiscoveryView
        };
        if(this.price){
            this.price.displayCurrency = app.settings.get('localCurrency');
            cardOptions.price = this.price;
        }
        if(this.thumbnail){
            cardOptions.thumbnail = this.thumbnail
        }
        if(this.title && this.title.length){
            cardOptions.title = this.title;
        }
        if(this.reputation){
            cardOptions.reputation = this.reputation;
        }
        if(this.availability){
            cardOptions.availability = this.availability;
        }
      this.$el.html(t(cardOptions));
    });

    this._$btnEdit = null;
    this._$btnDelete = null;

    if (this.reportBtn) this.reportBtn.remove();
    if (this.reportsUrl) {
      this.reportBtn = this.createChild(ReportBtn);
      this.listenTo(this.reportBtn, 'startReport', this.startReport);
      this.$('.js-reportBtnWrapper').append(this.reportBtn.render().el);
    }

    return this;
  }
}
