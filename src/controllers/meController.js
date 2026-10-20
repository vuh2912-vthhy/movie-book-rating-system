'use strict';
// Các tài nguyên của CHÍNH người đăng nhập: mã người dùng luôn lấy từ token, không nhận từ đường dẫn.
const ReviewService = require('../services/reviewService');
const WatchlistService = require('../services/watchlistService');
const NotificationService = require('../services/notificationService');
const AccountService = require('../services/accountService');

class MeController {
    static async getProfile(req, res, next) {
        try {
            res.status(200).json({ success: true, data: await AccountService.getProfile(req.user) });
        } catch (error) { next(error); }
    }

    static async updateProfile(req, res, next) {
        try {
            res.status(200).json({ success: true, message: 'Đã cập nhật hồ sơ', data: await AccountService.updateProfile(req.user, req.body, req.ip) });
        } catch (error) { next(error); }
    }

    static async listReviews(req, res, next) {
        try {
            const { items, pagination } = await ReviewService.listMine(req.user, req.query);
            res.status(200).json({ success: true, data: items, pagination });
        } catch (error) { next(error); }
    }

    static async listWatchlist(req, res, next) {
        try {
            const { items, pagination } = await WatchlistService.list(req.user, req.query);
            res.status(200).json({ success: true, data: items, pagination });
        } catch (error) { next(error); }
    }

    static async setWatchlist(req, res, next) {
        try {
            const { created, data } = await WatchlistService.set(req.user, req.params.titleId, req.body, req.ip);
            res.status(created ? 201 : 200).json({ success: true, message: 'Đã cập nhật danh sách theo dõi', data });
        } catch (error) { next(error); }
    }

    static async removeWatchlist(req, res, next) {
        try {
            const data = await WatchlistService.remove(req.user, req.params.titleId, req.ip);
            res.status(200).json({ success: true, message: 'Đã bỏ khỏi danh sách theo dõi', data });
        } catch (error) { next(error); }
    }

    static async listNotifications(req, res, next) {
        try {
            const { items, pagination, unreadCount } = await NotificationService.listMine(req.user, req.query);
            res.status(200).json({ success: true, data: items, pagination, unreadCount });
        } catch (error) { next(error); }
    }

    static async markNotificationRead(req, res, next) {
        try {
            res.status(200).json({ success: true, data: await NotificationService.markRead(req.user, req.params.id) });
        } catch (error) { next(error); }
    }

    static async markAllNotificationsRead(req, res, next) {
        try {
            res.status(200).json({ success: true, data: await NotificationService.markAllRead(req.user) });
        } catch (error) { next(error); }
    }
}

module.exports = MeController;
