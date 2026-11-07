const express = require('express')
const router = express.Router()
const chequeController = require('../controllers/cheque.controller')
const { authenticateJWT, requireRole, requirePermission } = require('../middleware/auth.middleware')
const { validateCheque } = require('../validators/cheque.validator')

router.use(authenticateJWT, requirePermission('cheques'))

router.route('/')
  .post(requireRole(['Admin']), validateCheque, chequeController.createCheque)
  .get(chequeController.getCheques)

router.route('/:id')
  .put(requireRole(['Admin']), chequeController.updateCheque)
  .patch(requireRole(['Admin']), chequeController.updateCheque)
  .delete(requireRole(['Admin']), chequeController.deleteCheque)

router.patch('/:id/status', requireRole(['Admin']), chequeController.updateChequeStatus)

module.exports = router
