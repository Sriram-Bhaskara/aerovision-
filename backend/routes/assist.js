const express = require('express');
const router = express.Router();
const { authenticate: authenticateToken } = require('../middleware/auth');
const { query } = require('../database/db');

function genRef() {
  return 'BLR-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Insert a DB notification and broadcast via socket
function pushNotification(req, userId, type, title, message, icon) {
  try {
    query(
      'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?,?,?,?,?)',
      [userId, type, title, message, icon || '🔔']
    );
    const io = req.app?.get('io');
    if (io) io.emit('notification', { title, message, icon });
  } catch (e) {
    console.error('[Assist] Notification error:', e.message);
  }
}

// GET /api/assist/verify/status
router.get('/verify/status', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, eligibility_type, document_type, document_name, status, submitted_at FROM assist_verifications WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1',
      [req.user.id]
    );
    const verification = (result.rows || [])[0] || null;
    res.json({ verification });
  } catch (err) {
    console.error('[Assist] Verify status error:', err.message);
    res.status(500).json({ error: 'Failed to fetch verification status' });
  }
});

// POST /api/assist/verify
router.post('/verify', authenticateToken, async (req, res) => {
  const { eligibility_type, document_type, document_name, document_data, date_of_birth } = req.body;

  if (!eligibility_type || !['senior', 'disabled', 'pregnant'].includes(eligibility_type)) {
    return res.status(400).json({ error: 'eligibility_type must be senior, disabled, or pregnant' });
  }

  try {
    // ── Senior: verify age from profile DOB ──────────────────
    if (eligibility_type === 'senior') {
      // Use submitted DOB or fall back to what's already on the profile
      let dob = date_of_birth;
      if (!dob) {
        const userRow = await query('SELECT date_of_birth FROM users WHERE id = ?', [req.user.id]);
        dob = (userRow.rows || [])[0]?.date_of_birth || null;
      }
      if (!dob) {
        return res.status(400).json({ error: 'Date of birth is required — please enter your date of birth.' });
      }

      // Calculate age
      const birth = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      if (
        today.getMonth() < birth.getMonth() ||
        (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
      ) age--;

      if (age < 60) {
        return res.status(403).json({
          error: `Age verification failed — you must be 60 or older for senior assistance. Your age: ${age}.`,
        });
      }

      // Save DOB to profile if provided in this request
      if (date_of_birth) {
        query('UPDATE users SET date_of_birth = ? WHERE id = ?', [date_of_birth, req.user.id]);
      }

      // Check if already approved
      const existing = await query(
        'SELECT id, eligibility_type, document_type, status FROM assist_verifications WHERE user_id = ? AND status = ? LIMIT 1',
        [req.user.id, 'approved']
      );
      if ((existing.rows || []).length > 0) return res.json({ verification: existing.rows[0] });

      await query(
        `INSERT INTO assist_verifications (user_id, eligibility_type, document_type, document_name, document_data, status)
         VALUES (?, 'senior', 'age_verified', '', '', 'approved')`,
        [req.user.id]
      );
      return res.json({
        verification: { eligibility_type: 'senior', document_type: 'age_verified', status: 'approved', age },
      });
    }

    // ── Disabled / Pregnant: require document upload ─────────
    if (!document_type || !['medical_certificate', 'aadhar'].includes(document_type)) {
      return res.status(400).json({ error: 'document_type must be medical_certificate or aadhar' });
    }
    if (!document_data) {
      return res.status(400).json({ error: 'Document file is required' });
    }

    const existing = await query(
      'SELECT id, eligibility_type, document_type, document_name, status FROM assist_verifications WHERE user_id = ? AND status = ? LIMIT 1',
      [req.user.id, 'approved']
    );
    if ((existing.rows || []).length > 0) return res.json({ verification: existing.rows[0] });

    await query(
      `INSERT INTO assist_verifications (user_id, eligibility_type, document_type, document_name, document_data, status)
       VALUES (?, ?, ?, ?, ?, 'approved')`,
      [req.user.id, eligibility_type, document_type, document_name || '', document_data]
    );
    res.json({
      verification: { eligibility_type, document_type, document_name: document_name || '', status: 'approved' },
    });
  } catch (err) {
    console.error('[Assist] Verify submit error:', err.message);
    res.status(500).json({ error: 'Failed to submit verification' });
  }
});

// GET /api/assist/admin/bookings — all bookings for staff dashboard
router.get('/admin/bookings', authenticateToken, async (req, res) => {
  try {
    const { status, service_type } = req.query;
    let sql = `SELECT mb.*, u.full_name AS user_name, u.email
               FROM mobility_bookings mb
               LEFT JOIN users u ON mb.user_id = u.id`;
    const params = [];
    const where  = [];
    if (status)       { where.push('mb.status = ?');       params.push(status); }
    if (service_type) { where.push('mb.service_type = ?'); params.push(service_type); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY mb.created_at DESC LIMIT 200';

    const result = await query(sql, params);
    res.json({ bookings: result.rows || [] });
  } catch (err) {
    console.error('[Assist] Admin list error:', err.message);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// PUT /api/assist/:id/status — staff updates booking status
router.put('/:id/status', authenticateToken, async (req, res) => {
  const { status } = req.body;
  const VALID = ['confirmed', 'staff_assigned', 'en_route', 'completed', 'cancelled'];
  if (!VALID.includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  try {
    const booking = await query('SELECT * FROM mobility_bookings WHERE id = ?', [req.params.id]);
    const b = (booking.rows || [])[0];
    if (!b) return res.status(404).json({ error: 'Booking not found' });

    await query('UPDATE mobility_bookings SET status = ? WHERE id = ?', [status, req.params.id]);

    const svcLabel = b.service_type === 'wheelchair' ? 'wheelchair' : 'buggy';
    const svcIcon  = b.service_type === 'wheelchair' ? '♿' : '🛺';

    const NOTIF = {
      staff_assigned: {
        title:   'Staff Assigned',
        message: `A staff member has been assigned to your ${svcLabel} booking (${b.booking_ref}). Please be ready at ${b.pickup_point}.`,
      },
      en_route: {
        title:   'Staff En Route',
        message: `Your staff member is on the way to ${b.pickup_point}. Please proceed to the pickup area now.`,
      },
      completed: {
        title:   'Assistance Completed',
        message: `Your ${svcLabel} assistance has been completed. Thank you — enjoy your flight! ✈`,
      },
      cancelled: {
        title:   'Booking Cancelled',
        message: `Your booking ${b.booking_ref} has been cancelled by staff. Contact the assistance desk for help.`,
      },
    };

    if (NOTIF[status]) {
      pushNotification(req, b.user_id, `assist_${status}`, NOTIF[status].title, NOTIF[status].message, svcIcon);
    }

    res.json({ success: true, status });
  } catch (err) {
    console.error('[Assist] Status update error:', err.message);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// POST /api/assist/book
router.post('/book', authenticateToken, async (req, res) => {
  const { service_type, passenger_name, phone, flight_iata, pickup_point, pickup_time, notes, is_paid_booking } = req.body;

  if (!service_type || !passenger_name || !flight_iata || !pickup_time) {
    return res.status(400).json({ error: 'service_type, passenger_name, flight_iata, and pickup_time are required' });
  }
  if (!['wheelchair', 'golf_cart'].includes(service_type)) {
    return res.status(400).json({ error: 'service_type must be wheelchair or golf_cart' });
  }

  let charge_amount  = 0;
  let payment_status = 'na';

  if (service_type === 'wheelchair') {
    const verif = await query(
      'SELECT id FROM assist_verifications WHERE user_id = ? AND status = ? LIMIT 1',
      [req.user.id, 'approved']
    );
    if (!(verif.rows || []).length) {
      return res.status(403).json({ error: 'Wheelchair assistance requires eligibility verification. Please complete verification first.' });
    }
  }

  if (service_type === 'golf_cart') {
    const verif = await query(
      'SELECT id FROM assist_verifications WHERE user_id = ? AND status = ? LIMIT 1',
      [req.user.id, 'approved']
    );
    const isEligible = (verif.rows || []).length > 0;

    if (isEligible) {
      charge_amount  = 0;
      payment_status = 'waived';
    } else if (is_paid_booking) {
      charge_amount  = 1000;
      payment_status = 'paid';
    } else {
      return res.status(403).json({
        error: 'Buggy requires eligibility verification (free) or payment of ₹1,000.',
        requires_payment: true,
      });
    }
  }

  const booking_ref    = genRef();
  const resolvedPickup = pickup_point || 'Main Entrance - T1';

  try {
    await query(
      `INSERT INTO mobility_bookings
         (booking_ref, user_id, service_type, passenger_name, phone, flight_iata, pickup_point, pickup_time, notes, status, charge_amount, payment_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [booking_ref, req.user.id, service_type, passenger_name, phone || '', flight_iata.toUpperCase(),
       resolvedPickup, pickup_time, notes || '', 'confirmed', charge_amount, payment_status]
    );

    // Notify the user
    const svcLabel = service_type === 'wheelchair' ? 'Wheelchair' : 'Buggy';
    const svcIcon  = service_type === 'wheelchair' ? '♿' : '🛺';
    pushNotification(
      req, req.user.id, 'assist_booking',
      `${svcLabel} Booked — ${booking_ref}`,
      `Your ${svcLabel.toLowerCase()} assistance is confirmed for flight ${flight_iata.toUpperCase()} at ${resolvedPickup}. Our staff will meet you at the designated time.`,
      svcIcon
    );

    res.json({
      booking_ref, service_type, passenger_name,
      flight_iata: flight_iata.toUpperCase(),
      pickup_point: resolvedPickup, pickup_time,
      status: 'confirmed', charge_amount, payment_status,
    });
  } catch (err) {
    console.error('[Assist] Book error:', err.message);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// GET /api/assist/my-bookings
router.get('/my-bookings', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM mobility_bookings WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ bookings: result.rows || [] });
  } catch (err) {
    console.error('[Assist] Fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// DELETE /api/assist/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await query('DELETE FROM mobility_bookings WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Assist] Delete error:', err.message);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

module.exports = router;
